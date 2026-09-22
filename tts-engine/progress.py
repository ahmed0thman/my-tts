"""Live progress for the one job the engine is running.

The board runs a single job at a time (ModelManager holds a lock across both
loading and inference), so a module-level singleton is enough — no job ids, no
registry. Engines report into it as they work and `GET /api/progress` reads it.

This exists because Masri Higgs generates at roughly 7x slower than realtime:
without it the UI shows a spinner for several minutes with nothing to look at,
and there is no way to tell a slow generation from a hung one.
"""

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

#: Frames per second of audio the Higgs LM emits — used to turn a frame count
#: into "seconds of audio produced so far".
_FRAME_RATE = 25


@dataclass
class Progress:
    state: str = "idle"  # idle | loading | generating | error
    model_id: Optional[str] = None
    detail: str = ""
    #: Sentence-level position, for models that chunk long text.
    chunk: int = 0
    chunks: int = 0
    #: Audio frames emitted in the current chunk, when the engine reports them.
    frames: int = 0
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    error: Optional[str] = None
    _last: Dict[str, Any] = field(default_factory=dict)

    # -- writers (called from engines / the manager) ----------------------

    def start_loading(self, model_id: str) -> None:
        self.state = "loading"
        self.model_id = model_id
        self.detail = f"تحميل النموذج {model_id}"
        self.chunk = self.chunks = self.frames = 0
        self.started_at = time.time()
        self.finished_at = None
        self.error = None

    def start_generating(self, model_id: str, chunks: int = 1) -> None:
        self.state = "generating"
        self.model_id = model_id
        self.detail = "جاري التوليد"
        self.chunk = 0
        self.chunks = max(1, chunks)
        self.frames = 0
        self.started_at = time.time()
        self.finished_at = None
        self.error = None

    def set_chunk(self, index: int, text: str = "") -> None:
        self.chunk = index
        self.frames = 0
        if text:
            self.detail = text[:60]

    def add_frames(self, n: int = 1) -> None:
        self.frames += n

    def finish(self) -> None:
        self.state = "idle"
        self.detail = ""
        self.finished_at = time.time()

    def fail(self, message: str) -> None:
        self.state = "error"
        self.error = message[:300]
        self.finished_at = time.time()

    # -- reader ------------------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        elapsed = (time.time() - self.started_at) if self.started_at else 0.0
        audio_seconds = self.frames / _FRAME_RATE

        # Chunks completed plus fractional progress within the current one is
        # not knowable ahead of time (the model decides when a sentence ends),
        # so percent is chunk-based only and deliberately never reaches 100.
        # Only a multi-sentence job has a countable fraction. A single opaque
        # call (SILMA, Chatterbox) would otherwise sit at 0% for its whole run,
        # which reads as stuck; the UI shows an indeterminate bar instead.
        percent = None
        if self.state == "generating" and self.chunks > 1:
            percent = min(99, round(100 * self.chunk / self.chunks))

        return {
            "state": self.state,
            "model_id": self.model_id,
            "detail": self.detail,
            "chunk": self.chunk,
            "chunks": self.chunks,
            "frames": self.frames,
            "audio_seconds": round(audio_seconds, 2),
            "elapsed": round(elapsed, 1),
            "percent": percent,
            "error": self.error,
        }


#: The one tracker the whole engine writes to.
tracker = Progress()
