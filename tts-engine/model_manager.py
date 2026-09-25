import asyncio
import logging
from typing import Any, Dict, Optional, Tuple

import torch

import model_registry
import progress

logger = logging.getLogger(__name__)


class ModelManager:
    """Owns the one model that is currently resident in memory.

    Only a single engine is kept loaded: on 16GB of unified memory, SILMA and a
    Chatterbox checkpoint together leave too little room for the rest of the
    stack. Switching models unloads the old one first. The exception is a switch
    between the two NAMAA dialects, which share a base and swap only their
    fine-tuned t3 weights.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
            cls._instance._init()
        return cls._instance

    def _init(self):
        self.device = self._detect_device()
        self.lock = asyncio.Lock()
        self.engine = None
        self.active_id: Optional[str] = None

    def _detect_device(self) -> str:
        if torch.backends.mps.is_available():
            logger.info("MPS device detected.")
            return "mps"
        logger.info("Falling back to CPU device.")
        return "cpu"

    # -- loading ----------------------------------------------------------

    async def ensure_loaded(self, model_id: Optional[str] = None):
        """Load `model_id`, swapping out whatever is resident. Returns the engine."""
        target = model_id or self.active_id or model_registry.DEFAULT_MODEL_ID

        if not model_registry.is_valid(target):
            raise ValueError(f"Unknown model '{target}'")

        async with self.lock:
            if self.engine is not None and self.active_id == target and self.engine.is_loaded:
                return self.engine

            previous = self.engine
            engine = model_registry.create(target, self.device)
            loop = asyncio.get_running_loop()

            def _load_sync():
                # Dialect switches reuse the loaded Chatterbox base instead of
                # re-downloading and re-instantiating the whole stack. Only
                # ChatterboxEngine has adopt(); checked by attribute so this
                # module never imports an adapter the bundle may not carry.
                adopt = getattr(engine, "adopt", None)
                if adopt is not None and adopt(previous):
                    return engine
                if previous is not None:
                    previous.unload()
                engine.load()
                return engine

            logger.info(f"Loading model '{target}' on {self.device}...")
            progress.tracker.start_loading(target)
            try:
                self.engine = await loop.run_in_executor(None, _load_sync)
                self.active_id = target
                # Loading is a phase of somebody's request, not a job of its
                # own: clear it so the tracker does not read "loading" forever
                # once the model is resident.
                progress.tracker.finish()
                logger.info(f"Model '{target}' loaded successfully on {self.device}.")
            except Exception as e:
                logger.error(f"Failed to load model '{target}': {e}")
                progress.tracker.fail(str(e))
                self.engine = None
                self.active_id = None
                raise

            return self.engine

    async def load_model(self):
        """Warm the default model at startup."""
        await self.ensure_loaded(model_registry.DEFAULT_MODEL_ID)

    # -- inference --------------------------------------------------------

    async def generate(
        self,
        text: str,
        model_id: Optional[str] = None,
        audio_prompt_path: Optional[str] = None,
        reference_text: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        engine = await self.ensure_loaded(model_id)

        async with self.lock:
            progress.tracker.start_generating(engine.id)
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: engine.generate(text, audio_prompt_path, reference_text, params or {}),
                )
                progress.tracker.finish()
                return result
            except Exception as e:
                logger.error(f"Generation error: {e}")
                progress.tracker.fail(str(e))
                raise

    # -- introspection ----------------------------------------------------

    @property
    def is_loaded(self) -> bool:
        return self.engine is not None and self.engine.is_loaded

    @property
    def sample_rate(self) -> int:
        return self.engine.sample_rate if self.is_loaded else 24000

    def get_status(self) -> dict:
        return {
            "model_loaded": self.is_loaded,
            "device": self.device,
            "sample_rate": self.sample_rate if self.is_loaded else None,
            "active_model": self.active_id,
        }

    def get_model_info(self) -> dict:
        models = model_registry.describe_all(self.device)
        active = next((m for m in models if m["id"] == self.active_id), None)
        return {
            "active_model": self.active_id,
            "device": self.device,
            "sample_rate": self.sample_rate,
            "is_loaded": self.is_loaded,
            "models": models,
            **({"model_name": active["repo"], "base_model": active["architecture"]} if active else {}),
        }

    def list_models(self) -> list:
        return model_registry.describe_all(self.device)
