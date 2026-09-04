"""SILMA TTS v1 — F5-TTS/DiT, 150M, Modern Standard Arabic + English."""

import gc
import logging
from importlib.resources import files
from typing import Any, Dict, Optional, Tuple

import numpy as np
import torch

from .base import TTSEngine

logger = logging.getLogger(__name__)

REPO_ID = "silma-ai/silma-tts"

# SILMA has no built-in voice: every call needs a reference clip plus its
# transcription. The package ships one Arabic sample we fall back to.
DEFAULT_REFERENCE_AUDIO = str(files("silma_tts").joinpath("infer/ref_audio_samples/ar.ref.24k.wav"))
DEFAULT_REFERENCE_TEXT = (
    "ويدقق النظر في القرآن الكريم وسائر الكتب السماوية "
    "ويتبع مسالك الرسل العظام عليهم الصلاة والسلام."
)

# preprocess_ref_audio_text() clips anything longer, and a clipped clip makes
# SILMA discard the supplied ref_text and re-transcribe with Whisper.
MAX_REFERENCE_SECONDS = 8.05


class SilmaEngine(TTSEngine):
    id = "silma"
    label = "SILMA TTS v1"
    dialect = "فصحى / MSA"

    def load(self) -> None:
        from silma_tts.api import SilmaTTS

        # enable_normalizer pulls the NeMo number/date grammars; force_tashkeel
        # loads CATT. Both are needed for correct Arabic pronunciation.
        self.model = SilmaTTS(
            model="SilmaTTS_V1_Small",
            device=self.device,
            enable_normalizer=True,
            force_tashkeel=True,
        )
        self.sample_rate = getattr(self.model, "target_sample_rate", 24000)
        self.is_loaded = True

    def unload(self) -> None:
        self.model = None
        self.is_loaded = False
        gc.collect()
        if self.device == "mps":
            torch.mps.empty_cache()

    def generate(
        self,
        text: str,
        reference_audio: Optional[str],
        reference_text: Optional[str],
        params: Dict[str, Any],
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        ref_file = reference_audio or DEFAULT_REFERENCE_AUDIO
        ref_text = reference_text if reference_audio else DEFAULT_REFERENCE_TEXT
        if ref_file == DEFAULT_REFERENCE_AUDIO:
            ref_text = DEFAULT_REFERENCE_TEXT

        raw_seed = params.get("seed")
        seed = int(raw_seed) if raw_seed not in (None, "") else None

        wav, sr, _spec = self.model.infer(
            ref_file=ref_file,
            ref_text=ref_text or "",
            gen_text=text,
            speed=float(params.get("speed", 1.0)),
            cfg_strength=float(params.get("cfgStrength", 2.0)),
            nfe_step=int(params.get("nfeStep", 16)),
            seed=seed,
            remove_silence=False,
        )

        if isinstance(wav, np.ndarray):
            wav = torch.from_numpy(wav.copy())
        elif not isinstance(wav, torch.Tensor):
            wav = torch.tensor(wav)

        return wav.float(), sr, str(self.model.seed)

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "id": cls.id,
            "label": cls.label,
            "dialect": cls.dialect,
            "repo": REPO_ID,
            "architecture": "F5-TTS / DiT, 150M",
            "supportsVoiceCloning": True,
            "requiresReferenceText": True,
            "maxReferenceSeconds": MAX_REFERENCE_SECONDS,
            "notes": "فصحى ونطق مشكّل تلقائياً. العينة المرجعية لازم تكون أقل من ٨ ثواني ومعاها نصها.",
            "params": [
                {"key": "speed", "label": "سرعة الإلقاء", "min": 0.5, "max": 2, "step": 0.05, "default": 1.0, "format": "x"},
                {"key": "cfgStrength", "label": "الالتزام بالعينة", "min": 1, "max": 4, "step": 0.1, "default": 2.0},
                {"key": "nfeStep", "label": "خطوات التوليد", "min": 8, "max": 32, "step": 4, "default": 16, "integer": True},
            ],
        }
