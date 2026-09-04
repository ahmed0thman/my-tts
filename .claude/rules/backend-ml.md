# Python ML Engine Rules (FastAPI & SILMA TTS)

## Environment & Dependencies
- Python **3.11** isolated in `tts-engine/venv`, provisioned with `uv venv --python 3.11`. Not 3.12/3.13: `silma-tts` pins `numpy<=1.26.4`.
- Core libraries: `silma-tts`, `nemo_text_processing`, `catt-tashkeel`, `fastapi`, `uvicorn`, `torch==2.8.0`, `torchaudio==2.8.0`.
- Native prerequisites: `brew install openfst ffmpeg`.
- Three dependencies cannot be resolved by pip on macOS and are installed `--no-deps`; the full reasoning lives at the top of `tts-engine/requirements.txt`. Do not "simplify" that staging away.
- All audio processing is handled via `torchaudio`.

## Multi-Model Rules
- Every backend lives in `tts-engine/engines/` and implements `TTSEngine`. Register it in `model_registry.py`; never special-case a model id in `main.py` or the frontend.
- A model's `describe()` carries its parameter schema, and the UI builds its controls from it. If a knob needs a new UI control type, extend the schema — do not hardcode the model.
- Only one model is resident at a time. Any new engine must implement `unload()` properly (drop refs, `gc.collect()`, `torch.mps.empty_cache()`), or switching will OOM the 16GB machine.
- Chatterbox's `T3` builds `patched_model` lazily on first inference and registers it as a submodule. Swapping `t3` weights afterwards must clear it first (`del t3.patched_model; t3.compiled = False`) or the strict `load_state_dict` fails with missing `patched_model.*` keys.

## Model Contract
- `silma-ai/silma-tts` is a zero-shot cloner with **no built-in voice**: every call needs `ref_file` + `ref_text`. The NAMAA models clone from audio alone.
- When no profile is selected, `model_manager.py` falls back to the sample shipped inside the package (`silma_tts/infer/ref_audio_samples/ar.ref.24k.wav`) and its known transcription.
- Generation parameters are `speed` (0.5–2.0), `cfg_strength` (1–4), `nfe_step` (8–32) and `seed`. The old Chatterbox `exaggeration`/`cfg` pair does not exist and must not reappear in the UI.
- The engine echoes the seed back so a take the user liked can be reproduced exactly.
- Arabic text is diacritized by CATT and number-normalized by NeMo before synthesis; both are loaded at model construction.

## Hardware Optimization (Apple Silicon M1 Pro)
- In `tts-engine/model_manager.py`, device detection checks:
  ```python
  if torch.backends.mps.is_available():
      return "mps"
  return "cpu"
  ```
- Inference is accelerated via Metal Performance Shaders (MPS), providing high throughput on unified memory.
- Concurrency is guarded by an `asyncio.Lock()` around the model inference to prevent memory thrashing on GPU/MPS unified buffers.

## API Standards
- Communication uses `multipart/form-data` for endpoints receiving text or files.
- Audio outputs are returned as `StreamingResponse` with `media_type="audio/wav"` and custom metadata headers:
  - `X-Audio-Path`: Relative storage path
  - `X-Saved-Path`: Absolute path the WAV was written to (the user's chosen save folder, or storage/audio)
  - `X-Duration`: Audio duration in seconds
  - `X-Sample-Rate`: Audio sampling rate in Hz
  - `X-Peak` / `X-Peak-Normalized`: Original waveform peak, and whether it was scaled down before writing
- Reference audio files must be clean WAV files between 3 and 30 seconds.

## Output Handling
- The vocoder occasionally returns peaks above full scale, which `torchaudio.save` hard-clips into audible crackle. `normalize_peak()` in `audio_utils.py` scales the waveform to 0.99 only when it exceeds 1.0, leaving quiet audio untouched so loudness stays comparable between generations.
- `/api/generate` accepts an optional `output_dir` form field. The canonical copy is always written to `storage/audio/` so playback, history and deletion keep working; a custom folder receives an additional copy.
- `/api/fs/browse` and `/api/fs/validate` back the control board's save-folder picker. They only list directories and never expose file contents.
