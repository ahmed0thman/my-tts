"""Dubbing: a new voice for a finished video.

The pipeline is transcribe → generate one take per line → lay the takes on a
silent track at the times the original lines were spoken → replace the
video's audio with it. Generation is the ordinary `/api/generate` path (each
line is a Generation row on the web side); this module holds the rest.

There is deliberately **no translation model**. To dub into another language
the user copies the transcript (one line per timed line), translates it
wherever they like, and pastes it back line for line — the lines keep their
timing. VoiceTut speaks Egyptian Arabic and English, so those are what the
pasted text can be.

* **Transcription** is Whisper large-v3-turbo — the checkpoint OmniVoice
  already uses to transcribe references, so it is usually cached. Sentence
  timestamps come from Whisper's own long-form decoding (`return_segments`).
  Measured on an M1 Pro: 43 s of speech in ~25 s, fp16 on MPS. Its segment
  ends run on to the next segment's start, so each line is tightened to where
  there is actually sound (`_tighten`) — otherwise every slot includes the
  pause after it and the dub would be timed to the pauses.
* **Timing**: the TTS side generates each line to the length of its slot
  (VoiceTut's `targetDuration`, see voicetut_engine.py); `assemble` then places
  every take at its line's start and, if one still runs into the next line,
  speeds it up (pitch kept, ffmpeg `atempo`) up to `MAX_SPEEDUP`, then trims.
  The track is exactly as long as the video.

Whisper is loaded for one transcription and released after it; the TTS model
stays resident.

Video I/O is ffmpeg: decoding the audio, a poster frame, and muxing the new
track. Found by `ffmpeg_exe()`.
"""

import gc
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np
import torch

import progress

logger = logging.getLogger(__name__)

ASR_REPO = "openai/whisper-large-v3-turbo"
ASR_RATE = 16000

#: A take that overruns its room is sped up at most this much; past it, trimmed.
MAX_SPEEDUP = 1.35
#: Sample rate and channels of the dubbed track (what video players expect).
OUT_RATE = 48000

VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi")
#: Containers the video stream is copied into as is. Anything else becomes .mp4.
KEEP_CONTAINER = (".mp4", ".mov", ".m4v", ".mkv")


# -- ffmpeg -------------------------------------------------------------------


def ffmpeg_exe() -> str:
    """The ffmpeg binary: `SAWTAK_FFMPEG`, imageio-ffmpeg's bundled copy, PATH, Homebrew.

    The desktop app is launched from Finder with a minimal PATH that does not
    include Homebrew, so the fixed locations are checked by name.
    """
    explicit = os.environ.get("SAWTAK_FFMPEG")
    if explicit and os.path.isfile(explicit):
        return explicit
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    found = shutil.which("ffmpeg")
    if found:
        return found
    for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if os.path.isfile(candidate):
            return candidate
    raise RuntimeError("ffmpeg مش موجود على الجهاز — ثبّته (brew install ffmpeg) عشان الدبلجة تشتغل")


def _run(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", *args], capture_output=True)


def _check(result: subprocess.CompletedProcess, what: str) -> None:
    if result.returncode != 0:
        tail = result.stderr.decode(errors="replace").strip().splitlines()[-3:]
        raise RuntimeError(f"{what}: {' | '.join(tail)}")


_DURATION = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_VIDEO_SIZE = re.compile(r"Stream #\S+.*?: Video: .*?(\d{2,5})x(\d{2,5})")


def probe(path: str) -> Dict[str, Any]:
    """Duration and streams, read from `ffmpeg -i` (ffprobe does not ship with imageio-ffmpeg)."""
    text = _run(["-i", path]).stderr.decode(errors="replace")
    match = _DURATION.search(text)
    if not match:
        raise ValueError("الملف ده مش فيديو نقدر نقراه")
    h, m, s = match.groups()
    size = _VIDEO_SIZE.search(text)
    return {
        "duration": int(h) * 3600 + int(m) * 60 + float(s),
        "has_video": " Video: " in text,
        "has_audio": " Audio: " in text,
        "width": int(size.group(1)) if size else None,
        "height": int(size.group(2)) if size else None,
    }


def poster(video: str, out: str, at: float) -> Optional[str]:
    """One frame as a JPEG, for the dub's card. Best effort."""
    result = _run(["-y", "-v", "error", "-ss", f"{at:.2f}", "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", out])
    return out if result.returncode == 0 and os.path.exists(out) else None


def load_audio(path: str, rate: int, channels: int = 1) -> np.ndarray:
    """Decode a file's audio to float32 — (samples,) mono or (channels, samples)."""
    result = _run(["-v", "error", "-i", path, "-vn", "-ac", str(channels), "-ar", str(rate), "-f", "f32le", "-"])
    _check(result, "فشل استخراج الصوت من الفيديو")
    audio = np.frombuffer(result.stdout, dtype=np.float32).copy()
    if channels == 1:
        return audio
    return audio.reshape(-1, channels).T


# -- transcription ------------------------------------------------------------


def _frame_levels(audio: np.ndarray, rate: int, hop: float = 0.01) -> np.ndarray:
    """dB level per 10 ms frame (20 ms window)."""
    step = int(rate * hop)
    frames = len(audio) // step
    if frames == 0:
        return np.zeros(0)
    trimmed = audio[: frames * step].reshape(frames, step).astype(np.float64)
    power = (trimmed ** 2).mean(axis=1)
    power = np.convolve(power, np.ones(2) / 2, mode="same")
    return 10 * np.log10(np.maximum(power, 1e-12))


def _tighten(start: float, end: float, levels: np.ndarray, floor: float) -> Optional[tuple]:
    """Shrink [start, end] to where there is sound, or None if there is none.

    Whisper's segments are contiguous: each ends where the next begins, pause
    included. Only ever shrinks — a segment is never widened past what Whisper
    heard.
    """
    a, b = int(start * 100), min(len(levels), int(np.ceil(end * 100)))
    if b <= a:
        return None
    chunk = levels[a:b]
    threshold = max(floor + 8.0, chunk.max() - 32.0)
    active = np.where(chunk > threshold)[0]
    if len(active) == 0:
        return None
    s = max(start, (a + active[0]) / 100 - 0.05)
    e = min(end, (a + active[-1] + 1) / 100 + 0.08)
    return (s, e) if e - s >= 0.25 else None


class _Loaded:
    """A model loaded for one job and released after it (see the module docstring)."""

    def __init__(self, device: str):
        self.device = device

    def release(self) -> None:
        for name in list(vars(self)):
            if name != "device":
                setattr(self, name, None)
        gc.collect()
        if self.device == "mps":
            torch.mps.empty_cache()


def transcribe(path: str, device: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Lines with start/end seconds and the spoken language (Whisper's code: `en`, `ar`, ...)."""
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    progress.tracker.start_generating("whisper", chunks=1)
    progress.tracker.detail = "بنسمع الفيديو ونكتب الكلام..."

    audio = load_audio(path, ASR_RATE)
    if len(audio) < ASR_RATE // 2:
        raise ValueError("الفيديو مفيهوش صوت كفاية نفرّغه")

    # fp16 on MPS: measured the same text as fp32 and ~10% faster.
    dtype = torch.float16 if device in ("mps", "cuda") else torch.float32
    held = _Loaded(device)
    try:
        held.processor = WhisperProcessor.from_pretrained(ASR_REPO)
        held.model = (
            WhisperForConditionalGeneration.from_pretrained(ASR_REPO, dtype=dtype, attn_implementation="eager")
            .to(device)
            .eval()
        )
        processor, model = held.processor, held.model

        long_form = len(audio) > 30 * ASR_RATE
        inputs = processor(
            audio,
            sampling_rate=ASR_RATE,
            return_tensors="pt",
            return_attention_mask=True,
            **({"truncation": False, "padding": "longest"} if long_form else {}),
        )
        features = inputs.input_features.to(device, dtype)

        with torch.inference_mode():
            if not language:
                token = model.detect_language(features[:, :, :3000])[0].item()
                language = processor.tokenizer.convert_ids_to_tokens(token).strip("<|>")
            out = model.generate(
                features,
                attention_mask=inputs.attention_mask.to(device),
                language=language,
                task="transcribe",
                return_timestamps=True,
                return_segments=True,
            )
        segments = out["segments"][0] if isinstance(out, dict) else []

        levels = _frame_levels(audio, ASR_RATE)
        floor = float(np.percentile(levels, 10)) if len(levels) else -120.0
        lines: List[Dict[str, Any]] = []
        for seg in segments:
            text = processor.decode(seg["tokens"], skip_special_tokens=True).strip()
            if not re.search(r"\w", text):
                continue
            span = _tighten(float(seg["start"]), float(seg["end"]), levels, floor)
            if span is None:
                # Text over silence is Whisper filling a gap ("Thanks for watching").
                continue
            lines.append({"start": round(span[0], 3), "end": round(span[1], 3), "text": text})

        return {"language": language, "duration": len(audio) / ASR_RATE, "lines": lines}
    finally:
        held.release()
        progress.tracker.finish()


# -- assembly -----------------------------------------------------------------


def _speed_up(wav: np.ndarray, rate: int, factor: float) -> np.ndarray:
    """Pitch-preserving tempo change through ffmpeg's atempo."""
    with tempfile.TemporaryDirectory() as folder:
        import soundfile as sf

        src, dst = os.path.join(folder, "in.wav"), os.path.join(folder, "out.wav")
        sf.write(src, wav, rate, subtype="FLOAT")
        _check(_run(["-y", "-v", "error", "-i", src, "-filter:a", f"atempo={factor:.4f}", dst]), "فشل ضبط سرعة المقطع")
        out, _ = sf.read(dst, dtype="float32")
    return out if out.ndim == 1 else out.mean(axis=1)


def build_track(
    clips: List[Dict[str, Any]], duration: float, clip_dir: str
) -> tuple:
    """Lay each take at its start on a silent mono track `duration` seconds long.

    `clips`: `{path, start}` in seconds, `path` a basename inside `clip_dir`.
    Returns (track at OUT_RATE, per-clip report: speed factor and seconds trimmed).
    """
    import torchaudio

    total = int(round(duration * OUT_RATE))
    track = np.zeros(total, dtype=np.float32)
    ordered = sorted(clips, key=lambda c: float(c["start"]))
    report = []
    for index, clip in enumerate(ordered):
        start = max(0.0, float(clip["start"]))
        following = float(ordered[index + 1]["start"]) if index + 1 < len(ordered) else duration
        room = max(0.05, following - start - 0.03)

        wav, rate = torchaudio.load(os.path.join(clip_dir, os.path.basename(clip["path"])))
        wav = wav.mean(dim=0)
        if rate != OUT_RATE:
            wav = torchaudio.functional.resample(wav, rate, OUT_RATE)
        x = wav.numpy().astype(np.float32)

        factor = 1.0
        length = len(x) / OUT_RATE
        if length > room + 0.02:
            factor = min(MAX_SPEEDUP, length / room)
            x = _speed_up(x, OUT_RATE, factor)
        trimmed = 0.0
        limit = int(room * OUT_RATE)
        if len(x) > limit:
            trimmed = (len(x) - limit) / OUT_RATE
            x = x[:limit].copy()
            fade = min(len(x), int(0.04 * OUT_RATE))
            x[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)

        at = int(round(start * OUT_RATE))
        end = min(total, at + len(x))
        track[at:end] += x[: end - at]
        report.append({"start": start, "speed": round(factor, 3), "trimmed": round(trimmed, 3)})
    return track, report


def assemble(
    video: str,
    clips: List[Dict[str, Any]],
    clip_dir: str,
    wav_out: str,
    video_out: str,
    background: float = 0.0,
) -> Dict[str, Any]:
    """Write the dubbed track (16-bit stereo WAV) and the video with it as its only audio."""
    import soundfile as sf

    info = probe(video)
    duration = info["duration"]
    track, report = build_track(clips, duration, clip_dir)
    stereo = np.stack([track, track])

    # The original soundtrack under the new voice, when asked — music and
    # effects live there too, and removing them outright can leave a video
    # unnaturally dry. It carries the old voice as well, so keep it low.
    if background > 0 and info["has_audio"]:
        original = load_audio(video, OUT_RATE, channels=2)
        n = min(original.shape[1], stereo.shape[1])
        stereo[:, :n] += original[:, :n] * float(background)

    peak = float(np.abs(stereo).max()) if stereo.size else 0.0
    if peak > 0.99:
        stereo *= 0.99 / peak
    sf.write(wav_out, stereo.T, OUT_RATE, subtype="PCM_16")

    def mux(video_args: List[str]) -> subprocess.CompletedProcess:
        faststart = ["-movflags", "+faststart"] if video_out.endswith((".mp4", ".mov", ".m4v")) else []
        return _run(
            ["-y", "-v", "error", "-i", video, "-i", wav_out, "-map", "0:v:0", "-map", "1:a:0", *video_args,
             "-c:a", "aac", "-b:a", "192k", *faststart, video_out]
        )

    result = mux(["-c:v", "copy"])
    if result.returncode != 0:
        # A codec the container cannot hold as is (VP9 into .mp4 on an old ffmpeg): re-encode the picture.
        logger.info("Stream copy failed, re-encoding video: %s", result.stderr.decode(errors="replace")[-200:])
        result = mux(["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"])
    _check(result, "فشل تركيب الصوت على الفيديو")

    return {
        "duration": duration,
        "clips": report,
        "sped_up": sum(1 for r in report if r["speed"] > 1.0),
        "trimmed": sum(1 for r in report if r["trimmed"] > 0),
    }


def output_extension(video: str) -> str:
    ext = os.path.splitext(video)[1].lower()
    return ext if ext in KEEP_CONTAINER else ".mp4"
