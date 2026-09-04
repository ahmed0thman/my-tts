"""NAMAA dialect models — Chatterbox Multilingual fine-tunes.

The Saudi and Egyptian checkpoints ship identical file layouts and differ only
in the fine-tuned `t3` weights, so both are served by this one adapter and
switching between them reuses the loaded base model.
"""

import gc
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import torch
from huggingface_hub import snapshot_download
from safetensors.torch import load_file as load_safetensors

from .base import TTSEngine

logger = logging.getLogger(__name__)

# Only the fine-tuned transformer is pulled from the NAMAA repos; the vocoder,
# voice encoder and tokenizer come from the shared Chatterbox base.
T3_WEIGHTS = "t3_mtl23ls_v2.safetensors"


class ChatterboxEngine(TTSEngine):
    """One NAMAA dialect checkpoint on top of ChatterboxMultilingualTTS."""

    def __init__(self, device: str, *, engine_id: str, label: str, dialect: str, repo_id: str, notes: str = ""):
        super().__init__(device)
        self.id = engine_id
        self.label = label
        self.dialect = dialect
        self.repo_id = repo_id
        self.notes = notes
        self.model = None

    # -- loading ----------------------------------------------------------

    def _download_t3(self) -> str:
        ckpt_dir = Path(
            snapshot_download(
                repo_id=self.repo_id,
                repo_type="model",
                revision="main",
                allow_patterns=[T3_WEIGHTS],
                token=os.getenv("HF_TOKEN"),
            )
        )
        return str(ckpt_dir / T3_WEIGHTS)

    def _apply_t3(self) -> None:
        path = self._download_t3()
        logger.info(f"Applying fine-tuned t3 weights from {path}...")
        state = load_safetensors(path, device=self.device)
        if "model" in state:
            state = state["model"][0]

        t3 = self.model.t3

        # T3 builds `patched_model` lazily on its first inference and registers
        # it as a submodule, which adds patched_model.* to its state_dict. A
        # checkpoint never contains those (they alias tfmr/speech_emb/speech_head),
        # so a strict load into an already-used T3 fails. Drop the cached backend
        # first: it is rebuilt on the next generate, against the new weights.
        if getattr(t3, "compiled", False):
            if hasattr(t3, "patched_model"):
                del t3.patched_model
            t3.compiled = False

        # Kept strict so a genuinely mismatched checkpoint still fails loudly.
        t3.load_state_dict(state)
        t3.to(self.device).eval()

    def load(self) -> None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        logger.info("Loading base ChatterboxMultilingualTTS model...")
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        self._apply_t3()

        if hasattr(self.model, "to") and str(getattr(self.model, "device", "")) != self.device:
            self.model.to(self.device)

        self.sample_rate = getattr(self.model, "sr", 24000)
        self.is_loaded = True

    def adopt(self, other: "ChatterboxEngine") -> bool:
        """Take over another NAMAA engine's loaded base and swap in our own t3.

        Both dialects share the same base, vocoder and tokenizer, so switching
        between them costs one 2.1GB state-dict load instead of a full reload.
        """
        if not isinstance(other, ChatterboxEngine) or not other.is_loaded or other.model is None:
            return False

        logger.info(f"Reusing loaded Chatterbox base from '{other.id}' for '{self.id}'.")
        self.model = other.model
        other.model = None
        other.is_loaded = False

        self._apply_t3()
        self.sample_rate = getattr(self.model, "sr", 24000)
        self.is_loaded = True
        return True

    def unload(self) -> None:
        self.model = None
        self.is_loaded = False
        gc.collect()
        if self.device == "mps":
            torch.mps.empty_cache()

    # -- inference --------------------------------------------------------

    def generate(
        self,
        text: str,
        reference_audio: Optional[str],
        reference_text: Optional[str],
        params: Dict[str, Any],
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        # Chatterbox clones from audio alone — reference_text is unused here.
        kwargs = {
            "text": text,
            "language_id": "ar",
            "exaggeration": float(params.get("exaggeration", 0.5)),
            "cfg_weight": float(params.get("cfgWeight", 0.5)),
            "temperature": float(params.get("temperature", 0.8)),
        }
        if reference_audio and os.path.exists(reference_audio):
            kwargs["audio_prompt_path"] = reference_audio

        wav = self.model.generate(**kwargs)

        if not isinstance(wav, torch.Tensor):
            wav = torch.from_numpy(wav)

        return wav.float(), self.sample_rate, None

    # -- capability declaration -------------------------------------------

    def describe_instance(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "dialect": self.dialect,
            "repo": self.repo_id,
            "architecture": "Chatterbox Multilingual fine-tune",
            "supportsVoiceCloning": True,
            "requiresReferenceText": False,
            "maxReferenceSeconds": None,
            "notes": self.notes,
            "params": [
                {"key": "exaggeration", "label": "التعبير العاطفي", "min": 0, "max": 1, "step": 0.05, "default": 0.5},
                {"key": "cfgWeight", "label": "سرعة الإيقاع", "min": 0, "max": 1, "step": 0.05, "default": 0.5},
                {"key": "temperature", "label": "التنوّع العشوائي", "min": 0.1, "max": 1.5, "step": 0.05, "default": 0.8},
            ],
        }

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        # Chatterbox variants differ per instance; the registry calls
        # describe_instance() instead.
        raise NotImplementedError("Use describe_instance() for ChatterboxEngine variants")
