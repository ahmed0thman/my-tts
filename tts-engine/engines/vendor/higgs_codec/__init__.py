"""Vendored HiggsAudioV2Tokenizer (the acoustic codec for the Higgs TTS models).

Copied from transformers v5.17.0 (Apache-2.0) because `chatterbox-tts` hard-pins
`transformers==5.2.0`, which predates this model — and upgrading transformers to
get it would break the two NAMAA engines. Only the relative imports are
rewritten to absolute ones; every internal it relies on already exists in 5.2.0
(verified: PreTrainedAudioTokenizerBase, conv1d_output_length, initialization,
Unpack, TransformersKwargs, auto_docstring, can_return_tuple, requires).

Re-vendor from the same upstream path if the codec ever needs updating; do not
hand-edit the model code.
"""

from .configuration import HiggsAudioV2TokenizerConfig
from .modeling import HiggsAudioV2TokenizerModel

__all__ = ["HiggsAudioV2TokenizerConfig", "HiggsAudioV2TokenizerModel"]
