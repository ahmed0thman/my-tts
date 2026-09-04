"""The models the control board can run.

Adding a model means adding one entry here — the API serves its metadata and
parameter schema, and the UI renders controls from that. No frontend change.
"""

from typing import Any, Dict, List

from engines import ChatterboxEngine, SilmaEngine

DEFAULT_MODEL_ID = "silma"


def _build(engine_id: str, device: str):
    if engine_id == "silma":
        return SilmaEngine(device)

    variant = _CHATTERBOX_VARIANTS[engine_id]
    return ChatterboxEngine(device, engine_id=engine_id, **variant)


_CHATTERBOX_VARIANTS: Dict[str, Dict[str, str]] = {
    "namaa-saudi": {
        "label": "NAMAA Saudi",
        "dialect": "سعودي / نجدي",
        "repo_id": "NAMAA-Space/NAMAA-Saudi-TTS",
        "notes": "لهجة سعودية. الاستنساخ من الصوت وحده — مش محتاج نص للعينة، ومفيش حد أقصى لطولها.",
    },
    "namaa-egyptian": {
        "label": "NAMAA Egyptian",
        "dialect": "مصري",
        "repo_id": "NAMAA-Space/NAMAA-Egyptian-TTS",
        "notes": "لهجة مصرية. الاستنساخ من الصوت وحده — مش محتاج نص للعينة، ومفيش حد أقصى لطولها.",
    },
}

MODEL_IDS: List[str] = ["silma", "namaa-saudi", "namaa-egyptian"]


def is_valid(engine_id: str) -> bool:
    return engine_id in MODEL_IDS


def create(engine_id: str, device: str):
    if not is_valid(engine_id):
        raise ValueError(f"Unknown model '{engine_id}'. Known: {', '.join(MODEL_IDS)}")
    return _build(engine_id, device)


def describe_all(device: str) -> List[Dict[str, Any]]:
    """Metadata for every registered model, without loading any of them."""
    out: List[Dict[str, Any]] = [SilmaEngine.describe()]
    for engine_id, variant in _CHATTERBOX_VARIANTS.items():
        out.append(ChatterboxEngine(device, engine_id=engine_id, **variant).describe_instance())
    return out
