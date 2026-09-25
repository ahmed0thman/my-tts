"""The models the control board can run.

Adding a model means adding one entry here — the API serves its metadata and
parameter schema, and the UI renders controls from that. No frontend change.
"""

from typing import Any, Dict, List

import engines

# This branch runs VoiceTut only — it is the model that actually clones a
# user's voice. The other adapters are left on disk and unregistered rather
# than deleted: they cost nothing while unlisted (ModelManager keeps one model
# resident), old `Generation` rows still render their labels, and re-listing
# one is a single edit to MODEL_IDS. Higgs in particular is worth keeping out
# of reach — one stray click is a 210 s load and 8.7 GB of RAM.
DEFAULT_MODEL_ID = "voicetut"


# Adapter classes are looked up by name on `engines`, which imports them on
# first access — so an unregistered model's runtime is never imported, and the
# desktop bundle can leave it out entirely.
_ENGINE_CLASS = {"silma": "SilmaEngine", "masri-higgs": "HiggsEngine", "voicetut": "VoiceTutEngine"}


def _build(engine_id: str, device: str):
    if engine_id in _ENGINE_CLASS:
        return getattr(engines, _ENGINE_CLASS[engine_id])(device)

    variant = _CHATTERBOX_VARIANTS[engine_id]
    return engines.ChatterboxEngine(device, engine_id=engine_id, **variant)


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

MODEL_IDS: List[str] = ["voicetut"]


def is_valid(engine_id: str) -> bool:
    return engine_id in MODEL_IDS


def create(engine_id: str, device: str):
    if not is_valid(engine_id):
        raise ValueError(f"Unknown model '{engine_id}'. Known: {', '.join(MODEL_IDS)}")
    return _build(engine_id, device)


def describe_all(device: str) -> List[Dict[str, Any]]:
    """Metadata for every *registered* model, without loading any of them.

    Driven by MODEL_IDS, so unlisting a model removes it from the UI in one
    place instead of here as well.
    """
    out: List[Dict[str, Any]] = []
    for engine_id in MODEL_IDS:
        if engine_id in _ENGINE_CLASS:
            out.append(getattr(engines, _ENGINE_CLASS[engine_id]).describe())
        else:
            variant = _CHATTERBOX_VARIANTS[engine_id]
            out.append(engines.ChatterboxEngine(device, engine_id=engine_id, **variant).describe_instance())
    return out
