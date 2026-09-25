import os
from typing import Optional
import uuid
import torchaudio
import aiofiles
from fastapi import UploadFile

def generate_unique_filename(prefix: str, extension: str) -> str:
    """Generates a UUID-based filename."""
    unique_id = str(uuid.uuid4())
    ext = extension if extension.startswith('.') else f".{extension}"
    return f"{prefix}_{unique_id}{ext}"

def get_audio_duration(file_path: str) -> float:
    """Returns the duration of the audio file in seconds."""
    info = torchaudio.info(file_path)
    return info.num_frames / info.sample_rate

#: Shorter than this and there is not enough speech to characterise a voice.
MIN_REFERENCE_SECONDS = 3.0

#: Fallback cap, used only when the caller does not know which model the clip
#: is for. The real limit belongs to the model: each engine publishes its own
#: `maxReferenceSeconds`, and callers should pass it. Exceeding a model's cap is
#: not a quality nicety — on OmniVoice it makes the model recite the reference
#: instead of the requested text.
DEFAULT_MAX_REFERENCE_SECONDS = 30.0


def validate_audio_file(file_path: str, max_seconds: float = DEFAULT_MAX_REFERENCE_SECONDS) -> dict:
    """Validates an audio file (format, duration, sample rate).

    `max_seconds` is the selected model's reference window; pass it, because a
    clip that is fine for one engine silently breaks another.
    """
    try:
        info = torchaudio.info(file_path)
        duration = info.num_frames / info.sample_rate
        
        is_valid = True
        errors = []
        
        if duration < MIN_REFERENCE_SECONDS or duration > max_seconds:
            is_valid = False
            errors.append(
                f"Duration {duration:.2f}s is out of range "
                f"({MIN_REFERENCE_SECONDS:.0f}-{max_seconds:.0f}s)."
            )
            
        return {
            "is_valid": is_valid,
            "duration": duration,
            "sample_rate": info.sample_rate,
            "channels": info.num_channels,
            "format": "wav", # torchaudio typically reads as tensor, actual format checking might require python-magic or assuming wav
            "errors": errors
        }
    except Exception as e:
        return {
            "is_valid": False,
            "errors": [f"Could not read audio file: {str(e)}"]
        }

async def save_uploaded_file(upload_file: UploadFile, destination: str) -> str:
    """Saves a FastAPI UploadFile to disk."""
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    async with aiofiles.open(destination, 'wb') as out_file:
        content = await upload_file.read()
        await out_file.write(content)
    return destination


def normalize_peak(wav: "torch.Tensor", target_peak: float = 0.99):
    """Scales a waveform down when it runs past full scale.

    Neural vocoders routinely return peaks slightly above 1.0, which torchaudio
    hard-clips on write and turns into audible crackle. Quiet audio is left
    alone so loudness stays comparable between generations.

    Returns (tensor, original_peak, was_normalized).
    """
    peak = float(wav.abs().max())
    if peak > 1.0:
        return wav * (target_peak / peak), peak, True
    return wav, peak, False


def resolve_output_dir(raw: Optional[str], default_dir: str) -> str:
    """Validates a user-supplied save folder, creating it when missing."""
    if not raw or not raw.strip():
        return default_dir

    path = os.path.abspath(os.path.expanduser(raw.strip()))

    if os.path.exists(path) and not os.path.isdir(path):
        raise ValueError(f"'{path}' is not a directory")

    try:
        os.makedirs(path, exist_ok=True)
    except OSError as e:
        raise ValueError(f"Could not create '{path}': {e}")

    if not os.access(path, os.W_OK):
        raise ValueError(f"No write permission for '{path}'")

    return path


def list_directories(raw: Optional[str], show_hidden: bool = False) -> dict:
    """Lists sub-directories of a path, for the control board folder picker."""
    path = os.path.abspath(os.path.expanduser(raw.strip())) if raw and raw.strip() else os.path.expanduser("~")

    if not os.path.isdir(path):
        raise ValueError(f"'{path}' is not an existing directory")

    entries = []
    try:
        for name in os.listdir(path):
            if not show_hidden and name.startswith("."):
                continue
            child = os.path.join(path, name)
            if os.path.isdir(child):
                entries.append({"name": name, "path": child, "writable": os.access(child, os.W_OK)})
    except PermissionError:
        raise ValueError(f"No permission to read '{path}'")

    entries.sort(key=lambda e: e["name"].lower())
    parent = os.path.dirname(path)

    return {
        "path": path,
        "parent": parent if parent != path else None,
        "writable": os.access(path, os.W_OK),
        "entries": entries,
    }


def build_shortcuts(default_dir: str) -> list:
    """Quick-jump locations offered by the folder picker."""
    home = os.path.expanduser("~")
    candidates = [
        {"label": "مجلد التطبيق الافتراضي", "path": default_dir},
        {"label": "المستخدم", "path": home},
        {"label": "سطح المكتب", "path": os.path.join(home, "Desktop")},
        {"label": "المستندات", "path": os.path.join(home, "Documents")},
        {"label": "التنزيلات", "path": os.path.join(home, "Downloads")},
        {"label": "الموسيقى", "path": os.path.join(home, "Music")},
    ]
    return [c for c in candidates if os.path.isdir(c["path"])]


def merge_clips(paths: list, gap_seconds: float = 0.3):
    """Concatenates clips in the given order with a silence gap between them.

    Used to assemble a project's segments into one episode. Clips are mixed
    down to mono and resampled to the first clip's rate, so segments rendered
    by different models (different sample rates) still join cleanly — the
    registry is allowed to change between the first segment and the last.

    Returns (tensor [1, n], sample_rate).
    """
    import torch

    if not paths:
        raise ValueError("No clips to merge")

    target_rate = None
    pieces = []
    for index, clip_path in enumerate(paths):
        wav, rate = torchaudio.load(clip_path)
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        if target_rate is None:
            target_rate = rate
        elif rate != target_rate:
            wav = torchaudio.functional.resample(wav, rate, target_rate)
        if index > 0 and gap_seconds > 0:
            pieces.append(torch.zeros(1, int(round(gap_seconds * target_rate))))
        pieces.append(wav)

    return torch.cat(pieces, dim=1), target_rate


def safe_export_name(hint: Optional[str], fallback: str = "episode") -> str:
    """A filename stem from a user-facing title — Arabic kept, path syntax dropped."""
    import re

    stem = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", (hint or "").strip())
    stem = re.sub(r"\s+", " ", stem).strip(" ._")[:80]
    return stem or fallback
