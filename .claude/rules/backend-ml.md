# Python ML Engine Rules (FastAPI, five Arabic models)

## Environment & Dependencies
- Python **3.11** isolated in `tts-engine/venv`, provisioned with `uv venv --python 3.11`. Not 3.12/3.13: `silma-tts` pins `numpy<=1.26.4`.
- Two unrelated runtimes share the venv: `silma-tts` (F5-TTS) and `chatterbox-tts` (the NAMAA fine-tunes). They coexist only at **`torch==2.6.0` / `torchaudio==2.6.0` / `transformers==5.2.0`** — what `chatterbox-tts` hard-pins. SILMA itself only needs `torch>=2.0`.
- 2.6 is also below the torchaudio 2.9 cutover to `torchcodec`, which needs FFmpeg ≤ 7 while Homebrew ships FFmpeg 9.
- `setuptools<81` is pinned: chatterbox's `perth` watermarker imports `pkg_resources`, removed in setuptools 81+. Without it `perth.PerthImplicitWatermarker` resolves to `None` and generation dies with `TypeError: 'NoneType' object is not callable`.
- Native prerequisites: `brew install openfst ffmpeg`.
- Three dependencies cannot be resolved by pip on macOS and are installed `--no-deps`; the full reasoning lives at the top of `tts-engine/requirements.txt`. Do not "simplify" that staging away.
- All audio processing is handled via `torchaudio`.

## Multi-Model Rules
- Every backend lives in `tts-engine/engines/` and implements `TTSEngine` (`base.py`). Register it in `model_registry.py`; never special-case a model id in `main.py` or the frontend.
- A model's `describe()` carries its parameter schema, and the UI builds its controls from it. If a knob needs a new UI control type, extend the schema — do not hardcode the model.
- `ChatterboxEngine` serves **both** NAMAA dialects from one class: they ship identical file layouts and differ only in the fine-tuned `t3`, so the registry passes `engine_id` / `label` / `dialect` / `repo_id` / `notes` per variant. Because the variants differ per instance, it exposes `describe_instance()`; its classmethod `describe()` deliberately raises.
- Only one model is resident at a time. Any new engine must implement `unload()` properly (drop refs, `gc.collect()`, `torch.mps.empty_cache()`), or switching will OOM the 16GB machine.
- Switching between the two NAMAA dialects goes through `ChatterboxEngine.adopt()`, which takes over the loaded base and swaps only the `t3` weights (~19s instead of ~50s). `ModelManager.ensure_loaded` tries `adopt()` first and only unloads the previous engine when it returns `False`.
- Chatterbox's `T3` builds `patched_model` lazily on first inference and registers it as a submodule. Swapping `t3` weights afterwards must clear it first (`del t3.patched_model; t3.compiled = False`) or the strict `load_state_dict` fails with missing `patched_model.*` keys. Keep the load **strict** so a genuinely wrong checkpoint still fails loudly.
- `HF_HUB_DISABLE_XET=1` is set at the very top of `main.py`, before any `huggingface_hub` import. HuggingFace's xet transfer stalls indefinitely on some repos (NAMAA-Saudi-TTS: 0 bytes in 10 minutes, then 2.1GB in 175s with it off).

## Desktop Bundle
- The packaged app ships its own CPython (uv's relocatable python-build-standalone, copied by `scripts/build-python-runtime.sh`) with **only** `tts-engine/requirements-desktop.txt` plus the same `--no-deps` trio as `setup.sh` (OmniVoice, voicetut-tts, accelerate). ~550 MB, against the dev venv's 1.4 GB. `pydub` and `tqdm` are there because VoiceTut's inference path imports them; they were found by running a generation from the bare runtime, not from its metadata (which lists the training stack).
- Adapters are imported lazily (`engines/__init__.py` `__getattr__`, `model_registry._ENGINE_CLASS`, duck-typed `adopt`). Importing all four at startup made the bundled engine die on `silma_tts`, which it does not carry. Keep new adapters lazy.
- The engine reads its data folder from `SAWTAK_DATA_ROOT` (storage/ lives under it); unset, it is the checkout.
- **Nothing may write inside the bundle.** Python's `__pycache__` did (2,600+ files on first run), which broke the ad-hoc signature — a downloaded copy then reads as "damaged", with no "Open Anyway". Every packaged Python process gets `PYTHONPYCACHEPREFIX=<data>/cache/pycache` (`pythonEnv()` in `electron/processes.js`). Verified: after a full run, `codesign --verify --deep --strict` still passes.

## Model Contract
| id | repo | dialect | ref text | ref cap | params |
|---|---|---|---|---|---|
| `silma` | `silma-ai/silma-tts` | فصحى / MSA | **required** | 8.05s | `speed` 0.5–2, `cfgStrength` 1–4, `nfeStep` 8–32 (+`seed`) |
| `namaa-saudi` | `NAMAA-Space/NAMAA-Saudi-TTS` | سعودي / نجدي | ignored | none | `exaggeration` 0–1, `cfgWeight` 0–1, `temperature` 0.1–1.5 |
| `namaa-egyptian` | `NAMAA-Space/NAMAA-Egyptian-TTS` | مصري | ignored | none | same three |
| `masri-higgs` | `ehabnegm/masri-higgs-v3-egyptian-tts` | مصري | **required** | 6s | `temperature` 0.1–1.5, `topK` 1–100 |
| `voicetut` | `mohammedaly22/VoiceTut-TTS` | مصري | **required** | 10s (3–10s best) | `guidanceScale` 1–5, `speed` 0.5–2, `numStep` 8–64 |

- `silma` is a zero-shot cloner with **no built-in voice**: every call needs `ref_file` + `ref_text`. With no profile selected, `SilmaEngine` falls back to the sample shipped inside the package (`silma_tts/infer/ref_audio_samples/ar.ref.24k.wav`) and its known transcription — and forces that transcription, since a user's `reference_text` would not describe it.
- SILMA's `preprocess_ref_audio_text` clips references over **8.05s**, and a clipped clip makes it **discard the supplied `ref_text`** and re-transcribe with Whisper large-v3-turbo (a 1.6GB download, cached per-process only). `MAX_REFERENCE_SECONDS` in `silma_engine.py` records the cap and `describe()` publishes it as `maxReferenceSeconds`; nothing trims clips yet.
- **`voicetut` is the model to reach for when the user wants their own voice.** OmniVoice/Qwen3-0.6B over the same Higgs codec, fine-tuned on ~380 h of Egyptian *podcast* speech — many speakers, with a published speaker-similarity figure of 0.83, which is the measurement Higgs's card says was never taken. Measured here on an M1 Pro, fp32 on MPS: **~4–7 s warm load, RTF 1.76x, peak RSS ~2.4 GB**, against Higgs's 210 s / 7.3x / 8.7 GB. Apache-2.0.
- **VoiceTut reference contract: 3–10 s plus a matching transcript.** Confirmed by ear: a 9 s cut of a 23 s clip reproduced the speaker's delivery where the full clip carried only the timbre, and it generated ~35% faster (RTF 2.51x vs 3.88x). The library warns above 20 s but **does not truncate when `ref_text` is given** — deliberate, so audio and transcript stay aligned — so an over-long clip is used whole and degrades quality silently. With no `ref_text` it loads Whisper large-v3-turbo (1.6 GB) to transcribe the clip, exactly as SILMA does. `speaker`, `ref_audio` and `instruct` are mutually exclusive, so the style-prompt mode cannot be combined with cloning.
- **`voicetut` installs `--no-deps`, and needs a shim.** `omnivoice` declares `transformers>=5.3.0` for exactly one class, `HiggsAudioV2TokenizerModel`; the other 15 symbols it imports exist in 5.2.0, and that class is already vendored at `engines/vendor/higgs_codec` for Higgs. `_install_codec_shim()` registers it into the transformers namespace, and must patch **both** `transformers` and `sys.modules["transformers"]` — they are different objects, because transformers replaces itself with a `_LazyModule`; patching only the former leaves `from transformers import ...` still raising ImportError. `accelerate` is required too, because VoiceTut loads with `device_map=`.
- **`masri-higgs` clones unreliably — send cloning users to `voicetut`.** It takes a clip plus transcription and uses the first 6 s, but the checkpoint is a 98 h single-narrator LoRA that pulls hard toward that narrator, and its card concedes speaker similarity was never re-benchmarked. Its take-to-take drift (±26 Hz median F0 on an *identical* reference) is large enough that single A/B samples cannot resolve whether a reference landed — do not draw conclusions from one pair. The codec is not the problem: a decode→encode round trip of the shipped references agrees with them 79% on codebook 0 (the lossy ceiling), and MPS encoding is bit-identical to CPU.
- **Both Qwen3-based engines need `eager` attention on MPS** (`higgs_engine`, `voicetut_engine`). `sdpa` aborts the process in `mps_matmul` — it cannot be caught. Any future Qwen3 engine must do the same.
- The NAMAA engines clone from audio alone. `generate()` ignores `reference_text` entirely, and omits `audio_prompt_path` when no profile is given.
- Only SILMA echoes a seed back (`str(self.model.seed)`), so a take the user liked can be reproduced exactly. Chatterbox returns `None` and the `X-Seed` header is empty.
- Arabic text is diacritized by CATT and number-normalized by NeMo before synthesis; both are loaded at `SilmaTTS` construction (`force_tashkeel=True`, `enable_normalizer=True`).

## Hardware Optimization (Apple Silicon M1 Pro)
- In `tts-engine/model_manager.py`, device detection checks:
  ```python
  if torch.backends.mps.is_available():
      return "mps"
  return "cpu"
  ```
- Inference is accelerated via Metal Performance Shaders (MPS), providing high throughput on unified memory.
- `ModelManager` is a singleton guarded by an `asyncio.Lock()` held across both loading and inference, so a model swap can never race a generation on the same unified-memory buffers.
- Blocking work (`load()`, `generate()`) is dispatched with `run_in_executor` so the event loop stays responsive.

## API Standards
- Communication uses `multipart/form-data` for endpoints receiving text or files.
- `POST /api/generate` takes `text`, `model_id`, optional `voice_profile_path`, `reference_text`, `output_dir`, and **`params` as a JSON string** — parameter names differ per backend, so they travel as a blob and the adapter picks out the keys it understands. An unknown `model_id` is a 400; a missing `reference_text` is a 400 only when the model declares `requiresReferenceText`.
- `GET /api/models` returns `{ models, default, active }` — every model's capabilities and parameter schema. This is what makes the UI model-agnostic.
- Audio outputs are returned as `StreamingResponse` with `media_type="audio/wav"` and custom metadata headers:
  - `X-Audio-Path`: Relative storage path
  - `X-Saved-Path`: Absolute path the WAV was written to (the user's chosen save folder, or storage/audio)
  - `X-Duration`: Audio duration in seconds
  - `X-Sample-Rate`: Audio sampling rate in Hz
  - `X-Peak` / `X-Peak-Normalized`: Original waveform peak, and whether it was scaled down before writing
  - `X-Seed`: Seed used, when the model exposes one
  - `X-Model-Id`: Which engine rendered it
- `POST /api/merge` takes `paths` (JSON array of stored `audioPath`s — only the basename is honoured, resolved inside storage/audio), `gap_ms` (clamped 0–5000), optional `output_dir` and `filename_hint`. Returns JSON `{ audio_path, saved_path, duration, sample_rate, file_size, clips }`. Runs in the executor without the model lock; writes 16-bit PCM.
- The engine serves over a Unix socket (`ENGINE_SOCKET` in `main.py`), so there is no CORS middleware — no browser can reach it.
- `GET /api/health` reports `model_loaded`, `device`, `sample_rate` and `active_model`. `GET /api/model-info` adds the full registry.
- Reference audio files must be clean WAV files at least 3 seconds long and no longer than the **registered models' shortest `maxReferenceSeconds`**. `validate_audio_file(path, max_seconds=...)` takes the cap as a parameter — `DEFAULT_MAX_REFERENCE_SECONDS = 30.0` is only the fallback for callers that do not know the model. `/api/upload-reference` passes `_reference_cap()`, the minimum over the registry, because a reference is stored once and used by whichever model is selected later.
- `voicetut_engine._check_reference_length()` re-checks at generation time and raises `ValueError` above the cap; `/api/generate` maps `ValueError` to **400**, not 500, since the message is written for the user in Arabic and travels to the toast via `detail`. This is deliberate rather than a silent truncation: the library does not truncate when `ref_text` is supplied, and cutting the audio without cutting the transcript to match is itself the cause of the drift.

## Output Handling
- The vocoder occasionally returns peaks above full scale, which `torchaudio.save` hard-clips into audible crackle. `normalize_peak()` in `audio_utils.py` scales the waveform to 0.99 only when it exceeds 1.0, leaving quiet audio untouched so loudness stays comparable between generations.
- `/api/generate` accepts an optional `output_dir` form field. The canonical copy is always written to `storage/audio/` so playback, history and deletion keep working; a custom folder receives an additional copy.
- `/api/fs/browse` and `/api/fs/validate` back the control board's save-folder picker. They only list directories and never expose file contents.
