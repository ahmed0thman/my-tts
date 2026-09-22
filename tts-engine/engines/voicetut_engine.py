"""VoiceTut — Egyptian Arabic with working voice cloning.

A Qwen3-0.6B backbone over the Higgs audio tokenizer, fine-tuned from
k2-fsa/OmniVoice on ~380 h of Egyptian podcast speech. It is the cloning model
in this board: `masri-higgs` is larger and reads beautifully in its own voice,
but it was fine-tuned on a single narrator and its speaker identity collapsed
onto him, which no adapter work can undo. VoiceTut was trained across many
podcast speakers, ships 17 reference voices, and its authors published a
speaker-similarity figure (0.83) — the measurement Higgs's card says was never
taken.

Measured here on an M1 Pro, fp32 on MPS: ~4 s warm load, RTF 2.5x with a 9 s
reference, peak RSS ~2.4 GB. Against Higgs's 210 s load, RTF 7.3x and 8.7 GB
that is a different class of model to run.

Licence is Apache-2.0, unlike Higgs's creator-only terms.
"""

import gc
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

import torch

import progress

from .base import TTSEngine

logger = logging.getLogger(__name__)

REPO_ID = "mohammedaly22/VoiceTut-TTS"

#: OmniVoice resamples whatever it is given; this is what it emits.
SAMPLE_RATE = 24000

#: The library warns above 20 s and recommends 3-10 s. Confirmed by ear here:
#: a 9 s cut of a 23 s clip reproduced the speaker's delivery, where the full
#: clip did not, and generation was ~35% faster (RTF 2.51x vs 3.88x). Published
#: as `maxReferenceSeconds` so the board can warn before a take is wasted.
MAX_REFERENCE_SECONDS = 10.0

#: Weights only — `optimizer.bin` and `random_states_*.pkl` are training
#: leftovers and together outweigh the model.
_ALLOW = ["*.json", "*.jinja", "model.safetensors", "reference_speakers/*"]

#: A blank line is the author saying "stop here" — honoured as a hard break.
#: The separator is captured, because *how many* blank lines were left says how
#: long the stop should be: one is a paragraph, two or more is a beat.
_PARAGRAPH_SPLIT = re.compile(r"((?:[ \t]*\n){2,})")
#: Sentence end. A colon at end of line counts: "خليني أسألك سؤال:" is a beat.
_SENTENCE_SPLIT = re.compile(r"(?<=[\.؟\!:])\s+")
#: `..` / `...` / `…` is a rhetorical pause **inside** a sentence, not the end
#: of one. Splitting there cut "بين موبايلك.. وشوية الرملة" in half and the
#: question lost its intonation, so ellipses are masked before splitting.
_ELLIPSIS = re.compile(r"\.{2,}|…")
_ELLIPSIS_MASK = "\u0001"

#: Silence inserted after a chunk. A paragraph break earns a real breath; an
#: ordinary sentence join just needs to not sound butt-joined; and leaving two
#: or more blank lines buys a deliberate beat — the pause before a punchline or
#: a rhetorical question, which one paragraph break is too short to carry.
GAP_SENTENCE = 0.12
GAP_PARAGRAPH = 0.38
GAP_BEAT = 0.95


def _install_codec_shim() -> None:
    """Make our vendored codec answer `from transformers import ...`.

    OmniVoice requires `transformers>=5.3.0` for exactly one class,
    `HiggsAudioV2TokenizerModel`. We are pinned to 5.2.0 because chatterbox is,
    and we already back-ported that class for the Higgs engine, so the pin is
    satisfiable — 15 of the 16 symbols OmniVoice imports exist in 5.2.0.

    The subtlety: `sys.modules["transformers"] is transformers` is **False**.
    Transformers replaces itself with a `_LazyModule`, so setting the attribute
    on the object `import transformers` binds leaves `from transformers import
    HiggsAudioV2TokenizerModel` still raising ImportError. Both objects have to
    be patched.
    """
    vendor_dir = os.path.join(os.path.dirname(__file__), "vendor")
    if vendor_dir not in sys.path:
        sys.path.insert(0, vendor_dir)

    import transformers

    from higgs_codec import HiggsAudioV2TokenizerModel

    targets = {id(transformers): transformers}
    targets.setdefault(id(sys.modules["transformers"]), sys.modules["transformers"])
    for module in targets.values():
        if not hasattr(module, "HiggsAudioV2TokenizerModel"):
            setattr(module, "HiggsAudioV2TokenizerModel", HiggsAudioV2TokenizerModel)


def _pack_sentences(text: str, max_chars: int = 220) -> List[Tuple[str, float]]:
    """Group text into chunks of at most `max_chars`, each with a gap to follow.

    Three things the library's own `split_sentences` gets wrong for authored
    scripts, all of which showed up in one 26 s take:

    * It emits one chunk per sentence and never merges, so a paragraph of short
      sentences becomes many generations joined by seams.
    * It treats `..` as a full stop. Egyptian scripts use it as a rhetorical
      pause mid-sentence — "بين موبايلك.. وشوية الرملة" is a single question,
      and splitting it there loses the question's intonation contour.
    * It ignores blank lines entirely, so a deliberate paragraph break arrives
      at the model as ordinary whitespace and produces no pause at all.

    Returns (chunk, seconds_of_silence_after) so paragraph breaks get a real
    breath and mere sentence packing does not.
    """
    out: List[Tuple[str, float]] = []

    # re.split with a capturing group interleaves separators, so the gap that
    # follows each paragraph is known from the text the author actually typed.
    parts = _PARAGRAPH_SPLIT.split(text)
    for index in range(0, len(parts), 2):
        paragraph = parts[index].strip()
        if not paragraph:
            continue
        separator = parts[index + 1] if index + 1 < len(parts) else ""
        gap = GAP_BEAT if separator.count("\n") >= 3 else GAP_PARAGRAPH

        masked = _ELLIPSIS.sub(lambda m: _ELLIPSIS_MASK * len(m.group()), paragraph)
        buf = ""
        for sentence in _SENTENCE_SPLIT.split(masked):
            sentence = " ".join(sentence.split())
            if not sentence:
                continue
            candidate = f"{buf} {sentence}".strip() if buf else sentence
            if len(candidate) > max_chars and buf:
                out.append((buf, GAP_SENTENCE))
                buf = sentence
            else:
                buf = candidate
        if buf:
            out.append((buf, gap))

    if not out:
        return [(" ".join(text.split()), 0.0)]

    # Restore the ellipses, and let the last chunk end without trailing silence.
    out = [(c.replace(_ELLIPSIS_MASK, "."), g) for c, g in out]
    out[-1] = (out[-1][0], 0.0)
    return out


class VoiceTutEngine(TTSEngine):
    id = "voicetut"
    label = "VoiceTut"
    dialect = "مصري"

    def __init__(self, device: str):
        super().__init__(device)
        self.sample_rate = SAMPLE_RATE
        self.tts = None

    # -- loading ----------------------------------------------------------

    def load(self) -> None:
        from huggingface_hub import snapshot_download

        _install_codec_shim()
        from voicetut_tts import VoiceTutTTS

        model_dir = snapshot_download(
            repo_id=REPO_ID,
            repo_type="model",
            allow_patterns=_ALLOW,
            token=os.getenv("HF_TOKEN"),
        )

        # fp32 deliberately: fp16 on MPS is untested here and the model is small
        # enough (~2.4 GB resident) that the memory is not worth the risk.
        logger.info(f"Loading {REPO_ID} (0.6B, fp32) on {self.device}...")
        self.tts = VoiceTutTTS.from_pretrained(model_dir, device=self.device, dtype="float32")

        # Qwen3 + sdpa aborts the process on Metal inside mps_matmul, the same
        # way it does for Higgs's Qwen3-4B. Force eager before any forward runs.
        if self.device == "mps":
            self._force_eager_attention()

        self.is_loaded = True

    def _force_eager_attention(self) -> None:
        for attr in ("model", "backbone", "lm", "llm"):
            holder = getattr(self.tts, attr, None)
            inner = getattr(holder, "model", holder)
            config = getattr(inner, "config", None)
            if config is None or not hasattr(config, "_attn_implementation"):
                continue
            config._attn_implementation = "eager"
            if hasattr(inner, "set_attn_implementation"):
                try:
                    inner.set_attn_implementation("eager")
                except Exception:  # older/newer signatures; the config still wins
                    pass
            logger.info(f"MPS: forced eager attention on {attr}")
            return
        logger.warning("MPS: could not locate the backbone config to force eager attention")

    def unload(self) -> None:
        self.tts = None
        self.is_loaded = False
        gc.collect()
        if self.device == "mps":
            torch.mps.empty_cache()

    # -- inference ---------------------------------------------------------

    @torch.no_grad()
    def generate(
        self,
        text: str,
        reference_audio: Optional[str],
        reference_text: Optional[str],
        params: Dict[str, Any],
    ) -> Tuple[torch.Tensor, int, Optional[str]]:
        overrides = {
            "guidance_scale": float(params.get("guidanceScale", 2.0)),
            "speed": float(params.get("speed", 1.0)),
            "num_step": int(params.get("numStep", 32)),
        }

        kwargs: Dict[str, Any] = {}
        if reference_audio and os.path.exists(reference_audio):
            kwargs["ref_audio"] = reference_audio
            # Supplying the transcript is not just for quality: with `ref_text`
            # absent the library transcribes the clip with Whisper
            # large-v3-turbo, a 1.6 GB download, exactly as SILMA does.
            if (reference_text or "").strip():
                kwargs["ref_text"] = reference_text.strip()
            else:
                logger.warning(
                    "No reference_text — VoiceTut will transcribe the clip with "
                    "Whisper large-v3-turbo (1.6 GB on first use)"
                )
        else:
            # `speaker`, `ref_audio` and `instruct` are mutually exclusive, so
            # with no profile we fall back to one of the 17 shipped voices.
            kwargs["speaker"] = "Mohamed"

        chunks = _pack_sentences(text)
        progress.tracker.start_generating(self.id, chunks=len(chunks))
        logger.info(f"Generating {len(text)} chars in {len(chunks)} chunk(s)")

        import numpy as np

        pieces: List[Any] = []
        for index, (chunk, gap_seconds) in enumerate(chunks):
            progress.tracker.set_chunk(index, chunk)
            logger.info(f"  {index + 1}/{len(chunks)} (+{gap_seconds:.2f}s): {chunk[:60]}")
            wav = self.tts.synthesize(chunk, output=None, **kwargs, **overrides)
            piece = np.asarray(wav, dtype=np.float32).squeeze()
            progress.tracker.add_frames(int(piece.shape[-1] / SAMPLE_RATE * 25))
            pieces.append(piece)
            if gap_seconds > 0:
                pieces.append(np.zeros(int(SAMPLE_RATE * gap_seconds), dtype=np.float32))

        if not pieces:
            raise RuntimeError("Model produced no audio for this text")

        progress.tracker.set_chunk(len(chunks))
        tensor = torch.from_numpy(np.concatenate(pieces)).float().squeeze()
        logger.info(f"  -> {tensor.shape[-1] / SAMPLE_RATE:.1f}s of audio")
        return tensor, SAMPLE_RATE, None

    # -- capability declaration -------------------------------------------

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "id": cls.id,
            "label": cls.label,
            "dialect": cls.dialect,
            "repo": REPO_ID,
            "architecture": "OmniVoice — Qwen3-0.6B + Higgs codec (diffusion)",
            "supportsVoiceCloning": True,
            "requiresReferenceText": True,
            "maxReferenceSeconds": MAX_REFERENCE_SECONDS,
            "notes": (
                "لهجة مصرية مع تبديل عربي/إنجليزي، وده النموذج اللي بيقلّد الأصوات فعلاً. "
                "أحسن نتيجة من عيّنة بين ٣ و١٠ ثواني مع نصها بالظبط — العيّنة الطويلة "
                "بتضعّف التقليد وبتبطّأ التوليد. رخصة Apache-2.0."
            ),
            "params": [
                {"key": "guidanceScale", "label": "الالتزام بالعينة", "min": 1.0, "max": 5.0, "step": 0.1, "default": 2.0},
                {"key": "speed", "label": "سرعة الإلقاء", "min": 0.5, "max": 2.0, "step": 0.05, "default": 1.0},
                {"key": "numStep", "label": "خطوات التوليد", "min": 8, "max": 64, "step": 1, "default": 32, "integer": True},
            ],
        }
