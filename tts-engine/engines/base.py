"""Common interface every TTS backend implements.

The control board supports models from two unrelated runtimes (SILMA's F5-TTS
and Resemble's Chatterbox). They disagree on almost everything — parameter
names, whether a reference transcription is required, how long a reference clip
may be — so each is wrapped in an adapter that presents the same surface and
declares its own capabilities.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Tuple

import torch


class TTSEngine(ABC):
    """One loadable speech model."""

    #: Stable identifier used by the API, the DB and the UI.
    id: str = ""
    #: Human label shown in the control board.
    label: str = ""
    #: Arabic dialect the model actually speaks.
    dialect: str = ""

    def __init__(self, device: str):
        self.device = device
        self.is_loaded = False
        self.sample_rate = 24000

    @abstractmethod
    def load(self) -> None:
        """Blocking load. Called off the event loop by ModelManager."""

    @abstractmethod
    def generate(
        self,
        text: str,
        reference_audio: Optional[str],
        reference_text: Optional[str],
        params: Dict[str, Any],
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        """Render `text`. Returns (waveform, sample_rate, seed_used)."""

    def unload(self) -> None:
        """Release weights. Called before another model is loaded — with 16GB
        of unified memory only one model fits comfortably alongside the rest of
        the stack."""
        self.is_loaded = False

    # -- capability declaration ------------------------------------------

    @classmethod
    @abstractmethod
    def describe(cls) -> Dict[str, Any]:
        """Metadata + parameter schema, served to the UI by GET /api/models.

        The UI renders its controls from this, so adding a model never requires
        touching the frontend's parameter handling.
        """
