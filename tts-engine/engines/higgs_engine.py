"""Masri Higgs v3 — Egyptian Arabic, Qwen3-4B backbone + Higgs audio codec.

Unlike the other two runtimes this one ships no inference package: the model
repo carries its own ~230-line serving module, which we import from the
downloaded snapshot rather than vendoring, so the code always matches the
weights it was published with. Only the acoustic codec is vendored (see
`engines/vendor/higgs_codec`), because it lives in a transformers version we
cannot install.

Generation is autoregressive over 25 Hz frames of 8 delay-patterned codebooks:
the LM emits one frame per step, the codec turns the finished frame grid back
into a waveform. Roughly 25 forward passes per second of audio, so expect
slower-than-realtime synthesis — this is a 4B model, an order of magnitude
larger than anything else in the registry.
"""

import gc
import glob
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch

import progress

from .base import TTSEngine

logger = logging.getLogger(__name__)

REPO_ID = "ehabnegm/masri-higgs-v3-egyptian-tts"
CODEC_REPO = "bosonai/higgs-audio-v2-tokenizer"

#: The codec's own rate; matches the rest of the board, so nothing is resampled.
SAMPLE_RATE = 24000
#: 24000 / hop 960 — one LM step per frame.
FRAME_RATE = 25

#: The model's own server truncates its built-in references to 150 frames (6s)
#: even though the clips behind them run 10-12s, and the transcript it pairs
#: with them still describes the whole clip. We keep that exactly.
MAX_REFERENCE_FRAMES = 150
MAX_REFERENCE_SECONDS = MAX_REFERENCE_FRAMES / FRAME_RATE  # 6.0

#: Tried and rejected: feeding each chunk the previous chunk's generated codes
#: as extra reference ("rolling voice context"), to stop chunks re-rolling the
#: voice independently. On the one long text measured it made things worse — a
#: 200 Hz pitch spike landed exactly on the chunk boundary and everything after
#: it sat ~15 Hz higher, with internal timbre cosine falling 0.960 -> 0.948.
#: Likely because ref_text already describes far more audio than ref_codes
#: carries, and appending more of both compounds that misalignment. Fix the
#: alignment before trying this again.

#: Safety rail per sentence: 900 frames is 36s of audio.
MAX_FRAMES_PER_SENTENCE = 900

#: Only the weights and the serving module — skip the repo's __pycache__.
_ALLOW = ["*.json", "*.safetensors", "serving/*.py", "serving/refs/*.pt"]

_SENTENCE_SPLIT = re.compile(r"(?<=[\.؟\!])\s+")


def _split_sentences(text: str, max_chars: int = 180) -> List[str]:
    """Pack the text into chunks of at most `max_chars`, breaking on sentences.

    Every chunk is a separate generation, and each one independently re-decides
    whose voice it is in (see `generate`), so the count matters: a paragraph of
    short sentences used to become a dozen separate draws whose results were
    concatenated, which is what produced files that switch voice mid-way.

    So sentences are *packed* up to the budget, not emitted one per chunk. The
    model card measures ~22 s paragraphs at CER 0.013 with "no drift or
    collapse", so long spans are the model's strength, not a risk. A sentence
    that alone exceeds the budget is still broken on commas.
    """
    out: List[str] = []
    buf = ""

    def flush() -> None:
        nonlocal buf
        if buf.strip():
            out.append(buf.strip())
        buf = ""

    def add(piece: str) -> None:
        """Append a piece, starting a new chunk when it would overflow."""
        nonlocal buf
        candidate = f"{buf} {piece}".strip() if buf else piece
        if len(candidate) > max_chars and buf:
            flush()
            buf = piece
        else:
            buf = candidate

    for sentence in _SENTENCE_SPLIT.split(text):
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= max_chars:
            add(sentence)
            continue
        flush()
        for part in sentence.split("،"):
            part = part.strip("، ").strip()
            if part:
                add(part + "،")
        flush()

    flush()
    return out or [text]


class HiggsEngine(TTSEngine):
    id = "masri-higgs"
    label = "Masri Higgs v3"
    dialect = "مصري"

    def __init__(self, device: str):
        super().__init__(device)
        self.sample_rate = SAMPLE_RATE
        self.model = None
        self.codec = None
        self.tokenizer = None
        self._voices: Dict[str, Tuple[torch.Tensor, str]] = {}
        self._default_voice: Optional[str] = None
        self._serving_dir: Optional[str] = None
        self._mod = None  # the repo's serving module namespace

    # -- loading ----------------------------------------------------------

    def _ensure_snapshot(self) -> str:
        from huggingface_hub import snapshot_download

        return snapshot_download(
            repo_id=REPO_ID,
            repo_type="model",
            allow_patterns=_ALLOW,
            token=os.getenv("HF_TOKEN"),
        )

    def load(self) -> None:
        model_dir = self._ensure_snapshot()
        self._serving_dir = str(Path(model_dir) / "serving")

        # The serving module and our vendored codec both go on sys.path. The
        # serving module imports its sibling by bare name (`higgs_v3_common`),
        # so its directory has to be importable, not just the package root.
        vendor_dir = str(Path(__file__).parent / "vendor")
        for path in (self._serving_dir, vendor_dir):
            if path not in sys.path:
                sys.path.insert(0, path)

        from transformers import AutoTokenizer

        import higgs_v3_common as common
        import higgs_v3_model
        import normalize as normalize_mod

        from higgs_codec import HiggsAudioV2TokenizerModel

        self._mod = {"common": common, "normalize": normalize_mod.normalize}

        logger.info(f"Loading {REPO_ID} (4B, bf16) on {self.device}...")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        model, _ = higgs_v3_model.HiggsV3ForTTS.from_checkpoint(model_dir, dtype=torch.bfloat16)

        # The serving module hardcodes sdpa, which Metal cannot compile for
        # Qwen3's GQA shapes — every forward dies in mps_matmul with
        # "incompatible dimensions", before any of our code runs. Reproduced on
        # a 2-layer random-weight Qwen3, so it is the kernel, not the
        # checkpoint; eager is correct on MPS and works in both dtypes.
        if self.device == "mps":
            model.body.config._attn_implementation = "eager"
            if hasattr(model.body, "set_attn_implementation"):
                model.body.set_attn_implementation("eager")

        self.model = model.to(self.device).eval()

        # The codec stays fp32: it is small, and quantizing the vocoder is
        # where audible artefacts come from.
        logger.info("Loading Higgs audio codec...")
        self.codec = (
            HiggsAudioV2TokenizerModel.from_pretrained(CODEC_REPO, dtype=torch.float32)
            .eval()
            .to(self.device)
        )

        self._load_builtin_voices()
        self.is_loaded = True

    def _load_builtin_voices(self) -> None:
        """Pre-encoded reference speakers shipped with the model."""
        self._voices = {}
        for path in sorted(glob.glob(os.path.join(self._serving_dir, "refs", "*.pt"))):
            name = os.path.splitext(os.path.basename(path))[0]
            blob = torch.load(path, map_location="cpu", weights_only=False)
            codes = blob["codes"].T.long()[:MAX_REFERENCE_FRAMES]
            self._voices[name] = (codes, self.tokenizer.decode(blob["text_ids"]))

        # The model's own server prefers this one; otherwise take any.
        self._default_voice = "noselleel" if "noselleel" in self._voices else next(iter(self._voices), None)
        logger.info(f"Built-in voices: {list(self._voices)} (default: {self._default_voice})")

    def unload(self) -> None:
        self.model = None
        self.codec = None
        self.tokenizer = None
        self._voices = {}
        self._mod = None
        self.is_loaded = False
        gc.collect()
        if self.device == "mps":
            torch.mps.empty_cache()

    # -- reference handling ------------------------------------------------

    @torch.no_grad()
    def _encode_reference(self, path: str) -> torch.Tensor:
        """Turn a user's WAV into the [frames, 8] code grid the prompt expects."""
        import torchaudio

        wav, sr = torchaudio.load(path)
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        if sr != SAMPLE_RATE:
            wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)

        codes = self.codec.encode(wav.unsqueeze(0).to(self.device))
        if not isinstance(codes, torch.Tensor):
            codes = codes.audio_codes
        # [1, n_codebooks, frames] -> [frames, n_codebooks]
        codes = codes[0].T.long().cpu()
        return codes[:MAX_REFERENCE_FRAMES]

    def _resolve_reference(
        self, reference_audio: Optional[str], reference_text: Optional[str]
    ) -> Tuple[torch.Tensor, str]:
        """A user's clip when there is one, otherwise the built-in speaker.

        Cloning here is real but unstable: the checkpoint is a LoRA merge over
        98 h of a single narrator, so it pulls hard toward his timbre and the
        reference wins only some of the time. The model card concedes speaker
        similarity was never evaluated after the fine-tune. Take-to-take drift
        is large enough (±26 Hz median F0 across takes that shared a reference)
        that a single A/B sample proves nothing about whether the reference
        landed — judge it over several takes, and lower `temperature` / `topK`
        to trade variety for adherence.
        """
        if reference_audio and os.path.exists(reference_audio):
            return self._encode_reference(reference_audio), (reference_text or "")
        if not self._default_voice:
            raise RuntimeError("No reference voice available")
        return self._voices[self._default_voice]

    # -- inference ---------------------------------------------------------

    @torch.no_grad()
    def _generate_codes(
        self,
        text: str,
        ref_codes: torch.Tensor,
        ref_text: str,
        temperature: float,
        top_k: int,
    ) -> Optional[torch.Tensor]:
        """One sentence -> [frames, 8] raw acoustic codes.

        Mirrors `gen_raw` from the model's own server: build the prompt, then
        sample one delay-patterned frame per step off the KV cache.
        """
        c = self._mod["common"]
        model, device = self.model, self.device

        # <|tts|> <|ref_text|> ref <|ref_audio|> refcodes <|text|> text <|audio|>
        items: List[Tuple[bool, Any]] = [(False, c.TOK_TTS), (False, c.TOK_REF_TEXT)]
        items += [(False, t) for t in self.tokenizer.encode(ref_text, add_special_tokens=False)]
        items.append((False, c.TOK_REF_AUDIO))
        delayed_ref = c.apply_delay_pattern(ref_codes)
        items += [(True, [int(x) for x in delayed_ref[k]]) for k in range(delayed_ref.shape[0])]
        items.append((False, c.TOK_TEXT))
        items += [(False, t) for t in self.tokenizer.encode(text, add_special_tokens=False)]
        items.append((False, c.TOK_AUDIO))

        embeds = [
            model.embed_audio(torch.tensor([v], device=device))[0]
            if is_audio
            else model.body.embed_tokens(torch.tensor([v], device=device))[0]
            for is_audio, v in items
        ]

        out = model.body(inputs_embeds=torch.stack(embeds).unsqueeze(0), use_cache=True)
        past, hidden = out.past_key_values, out.last_hidden_state[:, -1]

        frames: List[List[int]] = []
        eos_at: Optional[int] = None

        for step in range(MAX_FRAMES_PER_SENTENCE + c.NUM_CB):
            logits = model.audio_logits(hidden)[0].float()
            frame: List[int] = []

            for book in range(c.NUM_CB):
                # Codebook `book` is delayed by `book` steps: it emits padding
                # before its first real code and after the stop.
                if step < book:
                    frame.append(c.BOC_ID)
                    continue
                if eos_at is not None and step >= eos_at + book:
                    frame.append(c.EOC_ID)
                    continue

                book_logits = logits[book].clone()
                if book != 0:
                    # Only codebook 0 may signal the end of the utterance.
                    book_logits[c.NUM_REAL:] = -1e9
                kept, _ = torch.topk(book_logits, min(top_k, book_logits.shape[-1]))
                book_logits[book_logits < kept[-1]] = -1e9
                probs = torch.softmax(book_logits / temperature, dim=-1)
                frame.append(int(torch.multinomial(probs, 1)))

            if eos_at is None and frame[0] == c.EOC_ID:
                eos_at = step
            frames.append(frame)
            progress.tracker.add_frames()
            if eos_at is not None and step >= eos_at + c.NUM_CB - 1:
                break

            step_embed = model.embed_audio(torch.tensor([frame], device=device))
            out = model.body(
                inputs_embeds=step_embed.unsqueeze(1), past_key_values=past, use_cache=True
            )
            past, hidden = out.past_key_values, out.last_hidden_state[:, -1]

        if len(frames) <= c.NUM_CB:
            return None

        raw = c.revert_delay_pattern(torch.tensor(frames)).clamp(0, c.NUM_REAL - 1)
        if eos_at and eos_at < raw.shape[0]:
            raw = raw[:eos_at]
        return raw

    @torch.no_grad()
    def generate(
        self,
        text: str,
        reference_audio: Optional[str],
        reference_text: Optional[str],
        params: Dict[str, Any],
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        temperature = float(params.get("temperature", 0.7))
        top_k = int(params.get("topK", 40))

        ref_codes, ref_text = self._resolve_reference(reference_audio, reference_text)
        # Strips tashkeel and spells out digits — the model was trained on
        # undiacritized text, the opposite of what SILMA wants.
        normalized = self._mod["normalize"](text)

        sentences = _split_sentences(normalized)
        progress.tracker.start_generating(self.id, chunks=len(sentences))

        chunks: List[torch.Tensor] = []
        for index, sentence in enumerate(sentences):
            progress.tracker.set_chunk(index, sentence)
            logger.info(f"Generating {index + 1}/{len(sentences)}: {sentence[:50]}")
            codes = self._generate_codes(sentence, ref_codes, ref_text, temperature, top_k)
            if codes is None:
                logger.warning(f"Empty generation for: {sentence[:40]}")
                continue
            logger.info(f"  -> {codes.shape[0]} frames ({codes.shape[0] / FRAME_RATE:.1f}s of audio)")
            decoded = self.codec.decode(codes.T.unsqueeze(0).to(self.device))
            wav = getattr(decoded, "audio_values", decoded)
            if not torch.is_tensor(wav):
                wav = wav[0]
            chunks.append(wav.squeeze().detach().float().cpu())

        if not chunks:
            raise RuntimeError("Model produced no audio for this text")

        progress.tracker.set_chunk(len(sentences))
        return torch.cat(chunks), SAMPLE_RATE, None

    # -- capability declaration -------------------------------------------

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "id": cls.id,
            "label": cls.label,
            "dialect": cls.dialect,
            "repo": REPO_ID,
            "architecture": "Higgs Audio v3 — Qwen3-4B + acoustic codec",
            "supportsVoiceCloning": True,
            "requiresReferenceText": True,
            "maxReferenceSeconds": MAX_REFERENCE_SECONDS,
            "notes": (
                "لهجة مصرية، أكبر نموذج في اللوحة (4 مليار). العينة المرجعية بيتاخد منها "
                "أول ٦ ثواني ولازم معاها نصها. تقليد الصوت شغّال بس مش ثابت — النموذج "
                "متدرَّب على راوي واحد فبيشدّ ناحية صوته؛ قلّل التنوّع العشوائي وعدد "
                "الاحتمالات لو عايز التزام أكتر بالعينة. التوليد أبطأ من الزمن الحقيقي. "
                "الترخيص للاستخدام الشخصي وصنّاع المحتوى مع ذكر Boson AI's Higgs Audio."
            ),
            "params": [
                {"key": "temperature", "label": "التنوّع العشوائي", "min": 0.1, "max": 1.5, "step": 0.05, "default": 0.7},
                {"key": "topK", "label": "عدد الاحتمالات", "min": 1, "max": 100, "step": 1, "default": 40, "integer": True},
            ],
        }
