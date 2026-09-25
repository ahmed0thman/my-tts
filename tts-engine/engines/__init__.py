"""Engine adapters, imported on first use rather than here.

Each adapter pulls in its own runtime at import (SILMA reads a file out of the
silma_tts package, Chatterbox imports safetensors helpers, …). The desktop app
bundles only the registered model's runtime, so importing every adapter up
front made the engine fail to start on a model it would never load.
"""

from importlib import import_module

from .base import TTSEngine

_ADAPTERS = {
    "SilmaEngine": ".silma_engine",
    "ChatterboxEngine": ".chatterbox_engine",
    "HiggsEngine": ".higgs_engine",
    "VoiceTutEngine": ".voicetut_engine",
}


def __getattr__(name):
    if name in _ADAPTERS:
        return getattr(import_module(_ADAPTERS[name], __name__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["TTSEngine", *_ADAPTERS]
