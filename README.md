# 🎙️ Arabic TTS Control Board — three models, one board

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Node.js 24 LTS](https://img.shields.io/badge/Node.js-24%20LTS-green?style=flat&logo=node.js)](https://nodejs.org/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776ab?style=flat&logo=python)](https://www.python.org/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-blue?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.3-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Apple Silicon MPS](https://img.shields.io/badge/Hardware-M1%20Pro%20(MPS)-silver?style=flat&logo=apple)](https://developer.apple.com/metal/)

A local control board for Arabic text-to-speech and zero-shot voice cloning that
runs **three switchable models** — Fusha, Saudi and Egyptian — on your own
machine. Record or upload a reference clip, pick a dialect, tune the model's own
parameters, and generate. Nothing leaves the laptop.

| id | Model | Dialect | Runtime | Parameters |
|---|---|---|---|---|
| `silma` | [silma-ai/silma-tts](https://huggingface.co/silma-ai/silma-tts) | فصحى / MSA | F5-TTS / DiT, 150M | `speed`, `cfgStrength`, `nfeStep` |
| `namaa-saudi` | [NAMAA-Space/NAMAA-Saudi-TTS](https://huggingface.co/NAMAA-Space/NAMAA-Saudi-TTS) | سعودي / نجدي | Chatterbox Multilingual fine-tune | `exaggeration`, `cfgWeight`, `temperature` |
| `namaa-egyptian` | [NAMAA-Space/NAMAA-Egyptian-TTS](https://huggingface.co/NAMAA-Space/NAMAA-Egyptian-TTS) | مصري | Chatterbox Multilingual fine-tune | `exaggeration`, `cfgWeight`, `temperature` |

---

## 📑 Table of Contents
- [Key Features](#-key-features)
- [How the three models differ](#-how-the-three-models-differ)
- [Prerequisites](#-prerequisites)
- [Quick Start (2 Steps)](#-quick-start-2-steps)
- [Features & Usage Guide](#-features--usage-guide)
- [System Architecture](#-system-architecture)
- [Adding a fourth model](#-adding-a-fourth-model)
- [Directory Structure](#-directory-structure)
- [Available Scripts & Commands](#-available-scripts--commands)
- [Engine API](#-engine-api)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ✨ Key Features

- 🔀 **Three models, switchable mid-session**: MSA/Fusha via SILMA, plus Saudi Najdi and Egyptian via the NAMAA Chatterbox fine-tunes. One dropdown, no restart.
- 🧩 **The UI is built from the engine's schema**: `GET /api/models` publishes each model's capabilities *and its parameter list*, and the control board renders its sliders from that. Registering a model needs no frontend change.
- 🎤 **Zero-shot voice cloning**: clone from a reference clip — record it in the browser from a built-in teleprompter, or upload a WAV.
- 🕌 **Correct Arabic pronunciation**: SILMA diacritizes with CATT and normalizes numbers/dates with NeMo before synthesis.
- 📁 **Choose where files land**: a save-folder picker backed by the engine's filesystem endpoints; the canonical copy always stays in `storage/audio/` so history and playback keep working.
- 🔊 **No clipping**: neural vocoders routinely peak above full scale, which `torchaudio.save` would hard-clip into audible crackle. Output is scaled to 0.99 only when it exceeds 1.0, so loudness stays comparable between takes.
- 🎲 **Reproducible takes**: SILMA echoes its seed back, and it is stored with the generation.
- ⚡ **Batch mode**: one clip per line.
- 💾 **Model-scoped presets** and 📜 **full generation history** with inline players, downloads and retries.
- 🖥️ **RTL Egyptian-Arabic interface**: Shadcn/ui, Tailwind CSS v4, the Cairo typeface, light/dark.
- 🚀 **Apple Silicon acceleration** via Metal Performance Shaders (MPS), with CPU fallback.

---

## 🔍 How the three models differ

They come from two unrelated runtimes and do **not** behave the same way:

|  | SILMA | NAMAA Saudi / Egyptian |
|---|---|---|
| Clones from | reference clip **+ its transcription** | reference clip alone |
| Reference length cap | **8.05 s** | none |
| Reference text field | required | ignored |
| Seed returned | yes | no |
| Cold load | ~13 s | ~37 s (~19 s when switching *between* the two dialects) |

Two consequences worth knowing:

1. **SILMA silently truncates references over 8.05 s** — and once a clip is cut,
   it discards the transcription you supplied and re-transcribes with Whisper
   large-v3-turbo (a 1.6 GB download on first use). The recorder's guidance is
   currently tuned for the NAMAA models (12–22 s), so clips recorded here work
   as-is with NAMAA and get truncated by SILMA.
2. **Parameters do not transfer between models.** Switching resets them to the
   new model's defaults, and a saved preset only appears when its model is
   selected.

Only one model stays resident at a time — on 16 GB of unified memory, SILMA plus
a Chatterbox checkpoint would crowd out the rest of the stack. Switching unloads
the previous one; switching between the two NAMAA dialects reuses the loaded base
and swaps just the fine-tuned weights.

---

## 📋 Prerequisites

1. **Operating System**: macOS on Apple Silicon (what this is tuned for). Linux works; the Homebrew steps become your distro's equivalents.
2. **Node.js**: **v24+ LTS**.
3. **Python 3.11** — provisioned automatically by `uv`. Not 3.12/3.13: `silma-tts` pins `numpy<=1.26.4`, which has no wheels there.
4. **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
5. **Homebrew** — for `openfst` (pynini compiles against it) and `ffmpeg`.
6. **Docker** — for PostgreSQL 17 via Docker Compose (or bring your own PostgreSQL and edit `DATABASE_URL`).
7. **Disk space**: ~10 GB of model weights, plus ~3 GB of Python packages.

---

## 🚀 Quick Start (2 Steps)

### Step 1: Automated First-Time Setup
```bash
./scripts/setup.sh
```
Checks prerequisites, creates `.env`, starts PostgreSQL on port 5440, installs
Node dependencies, applies the Prisma schema, builds the Python 3.11 environment
(including the three packages that cannot be pip-installed on macOS as
published), verifies both engine import chains, and pre-downloads ~10 GB of
weights so your first generation is not a long wait.

### Step 2: Start Development Servers
```bash
./scripts/dev.sh
```
Starts PostgreSQL, the FastAPI engine on **:8000**, and Next.js on **:3000**.
Ctrl+C stops all of them.

👉 **[http://localhost:3000](http://localhost:3000)**
*(Swagger docs: [http://localhost:8000/docs](http://localhost:8000/docs))*

---

## 📖 Features & Usage Guide

### 1. Record or upload a voice
1. Go to **الأصوات** (`/voices`) → **إضافة صوت جديد**.
2. **Record tab** — read the on-screen script aloud. It is written in Fusha for
   phonetic coverage and prosody range, and because you read a *known* text, the
   transcription SILMA needs is filled in for you with no typing and no ASR.
   The browser records raw (echo cancellation, noise suppression and AGC all
   off — that processing degrades the timbre the cloner depends on), then
   decodes to mono 24 kHz, trims edge silence, normalizes, and writes a 16-bit
   PCM WAV entirely client-side.
3. **Upload tab** — drop a clean WAV (3–30 s, quiet room, no music). You will be
   asked for its transcription, which SILMA needs and NAMAA ignores.
4. Optionally **تعيين كافتراضي**.

A profile missing its transcription shows a `ناقص نص العينة` badge; you can add
it any time from the card, and it only blocks generation on SILMA.

### 2. Generate
On the studio page (`/`):
- **نموذج النطق** — pick the model. Badges show its dialect, whether it needs
  reference text, and its clip cap. Your choice is remembered across sessions.
- **الصوت** — the default sample or one of your profiles.
- **Parameters** — rendered from the selected model's own schema:
  - *SILMA*: `سرعة الإلقاء` 0.5–2, `الالتزام بالعينة` 1–4, `خطوات التوليد` 8–32
  - *NAMAA*: `التعبير العاطفي` 0–1, `سرعة الإيقاع` 0–1, `التنوّع العشوائي` 0.1–1.5
- **مكان الحفظ** — an optional folder for an extra copy.
- **توليد الصوت**, or ⌘/Ctrl + Enter.

### 3. Batch Mode
Toggle **وضع الدفعات** and put one sentence per line; each line becomes its own
clip, generated sequentially and logged separately.

### 4. Presets
Save the current parameter combination from **حفظ كإعداد مسبق** in the studio,
or build one on `/presets`, which has its own model picker and renders that
model's sliders.

Both the persona chips in the studio and the suggestions on `/presets` are
described as a *tone* — pace, expressiveness, fidelity — and resolved against
whichever model is selected, using that model's own ranges and defaults. So
«سريع» means `speed 1.6` on SILMA and `cfgWeight 0.2` on a NAMAA model, and a
suggestion a model cannot express (NAMAA has no fidelity knob) is simply not
offered. Presets carry their model id, so the studio dropdown only lists the
ones matching the model you have selected.

### 5. History
`/history` shows totals, success rate and cumulative duration, filterable by
voice and status, with inline playback, WAV download, retry (which reuses the
original model and parameters) and delete.

---

## 🏗️ System Architecture

```
[ Browser / RTL UI ]
         │
         ▼
[ Next.js 15 App ] ◄──────► [ PostgreSQL 17 :5440 ] (Prisma ORM)
         │
         │  multipart HTTP — src/lib/tts-client.ts
         ▼
[ FastAPI engine :8000 ]
         │
         ├── model_registry.py ── the one place a model is registered
         │
         ▼
[ ModelManager ] ── one model resident, asyncio.Lock ── MPS (Metal)
         │
         ├── engines/silma_engine.py       → silma
         └── engines/chatterbox_engine.py  → namaa-saudi | namaa-egyptian
         │
         ▼
[ storage/audio · storage/voice-samples ]
```

---

## 🧩 Adding a fourth model

1. Write an adapter in `tts-engine/engines/` implementing `TTSEngine`:
   `load()`, `generate()`, `unload()`, and a `describe()` carrying its metadata
   and parameter list.
2. Add one entry to `tts-engine/model_registry.py`.
3. There is no step 3. `GET /api/models` picks it up, the selector lists it, and
   `ModelParams` renders its sliders.

Two hard requirements: `unload()` must actually release the weights (drop refs,
`gc.collect()`, `torch.mps.empty_cache()`) or switching will OOM a 16 GB
machine; and parameter keys must never be added as database columns — they
belong in the `params` blob.

---

## 📂 Directory Structure

```
my-tts/
├── .claude/                        # Claude Code agent configuration
│   ├── rules/                      # architecture, frontend, backend-ml, database, arabic-i18n
│   ├── commands/                   # setup, dev, build, db workflows
│   ├── settings.json               # environment versions and command permissions
│   └── project-state.md            # full inventory & verified state
├── CLAUDE.md                       # root briefing file for agent sessions
├── tts-engine/                     # Python FastAPI sidecar
│   ├── main.py                     # REST endpoints, CORS, HF_HUB_DISABLE_XET
│   ├── model_registry.py           # ← the single place a model is registered
│   ├── model_manager.py            # one-resident-model manager, MPS detection, locking
│   ├── audio_utils.py              # validation, peak normalization, folder browsing
│   ├── engines/
│   │   ├── base.py                 # the TTSEngine interface
│   │   ├── silma_engine.py         # SILMA (F5-TTS)
│   │   └── chatterbox_engine.py    # both NAMAA dialects, incl. adopt()
│   └── requirements.txt            # pins + the macOS staged-install rationale
├── src/                            # Next.js 15 application
│   ├── app/
│   │   ├── (dashboard)/            # studio, voices, history, presets, settings
│   │   └── api/audio/[...path]/    # Range-capable audio streaming route
│   ├── actions/                    # Server Actions (generation, voices, presets, models, filesystem)
│   ├── hooks/                      # React Query hooks
│   ├── components/
│   │   ├── generation/             # model-selector, model-params, text-input, voice-controls, players
│   │   ├── voices/                 # voice-recorder, upload-dialog, voice-card
│   │   ├── history/ layout/ studio/ tour/
│   │   └── ui/                     # 19 Shadcn components
│   └── lib/                        # prisma, tts-client, validations, audio-encode, reference-script
├── prisma/schema.prisma            # VoiceProfile, Generation, Preset
├── storage/                        # audio/ and voice-samples/ (gitignored)
├── scripts/                        # setup.sh, dev.sh
└── docker-compose.yml              # postgres:17-alpine on host port 5440
```

---

## 🛠️ Available Scripts & Commands

| Command | Purpose |
| :--- | :--- |
| `./scripts/setup.sh` | Full environment setup, including ~10 GB of model weights |
| `./scripts/dev.sh` | Launches PostgreSQL, the FastAPI engine and Next.js together |
| `npm run dev` | Next.js dev server only (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript strict check (currently 0 errors) |
| `npx prisma studio` | Visual database browser |
| `npx prisma db push` | Push the schema to PostgreSQL |
| `tts-engine/venv/bin/python -m py_compile tts-engine/*.py tts-engine/engines/*.py` | Python syntax check |
| `curl -s localhost:8000/api/models` | Registry + which model is resident |

---

## 🔌 Engine API

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/generate` | Synthesize. Form fields: `text`, `model_id`, optional `voice_profile_path`, `reference_text`, `output_dir`, and `params` as a **JSON string**. Responds with the WAV plus `X-Audio-Path`, `X-Saved-Path`, `X-Duration`, `X-Sample-Rate`, `X-Peak`, `X-Peak-Normalized`, `X-Seed`, `X-Model-Id`. |
| `GET /api/models` | Every model's capabilities and parameter schema, plus `default` and `active`. |
| `POST /api/upload-reference` | Validates and stores a 3–30 s WAV. |
| `GET /api/voices` · `DELETE /api/voices/{filename}` | Reference sample library. |
| `GET /api/fs/browse` · `GET /api/fs/validate` | Directory listing for the save-folder picker (directories only — never file contents). |
| `GET /api/health` | Status, uptime, device, sample rate, `active_model`. |
| `GET /api/model-info` | Active model plus the full registry. |

---

## ❓ Troubleshooting & FAQ

### Why does the first generation with a model take so long?
It is being loaded (and on a fresh machine, downloaded). Roughly: SILMA ~13 s,
a NAMAA model ~37 s cold, ~19 s when switching from the other NAMAA dialect.
Subsequent generations reuse the resident model.

### Why did switching models unload the previous one?
By design. 16 GB of unified memory does not fit two of these models plus
PostgreSQL, Next.js and a browser. Resident memory stays around 0.9 GB across a
full round trip.

### The engine is downloading Whisper — why?
A reference clip longer than **8.05 s** was used with SILMA. It truncates the
clip, and a truncated clip makes it discard your transcription and re-transcribe
with Whisper large-v3-turbo (1.6 GB, cached at
`~/.cache/huggingface/hub/models--openai--whisper-large-v3-turbo`). Use a shorter
reference with SILMA, or use a NAMAA model, which has no cap.

### A HuggingFace download is stuck at 0 bytes.
That is the xet transfer stalling — observed on NAMAA-Saudi-TTS at 0 bytes for
10 minutes, then 2.1 GB in 175 s with it disabled. `HF_HUB_DISABLE_XET=1` is
already set at the top of `tts-engine/main.py`; export it in your shell too if
you are downloading manually.

### `TypeError: 'NoneType' object is not callable` at `PerthImplicitWatermarker`
`perth` imports `pkg_resources`, removed in setuptools 81+, and swallows the
ImportError so the class silently becomes `None`. `requirements.txt` pins
`setuptools<81`.

### `pip install silma-tts` fails on macOS
It does — three separate incompatibilities, all handled by `setup.sh` and
documented at the top of `tts-engine/requirements.txt`: `catt-tashkeel` pins the
CUDA-only `onnxruntime-gpu`; `nemo_text_processing` pins a pynini with no macOS
wheels; and Python must be 3.11 for `numpy<=1.26.4`.

### `ModuleNotFoundError: No module named 'fastapi'` when starting the engine
A stale `VIRTUAL_ENV` inside `venv/bin/activate` (usually from renaming the venv
directory) puts a nonexistent path on `PATH` and a pyenv shim wins. `dev.sh`
calls the venv binaries by absolute path for exactly this reason; if you start
uvicorn by hand, do the same.

### Prisma reports `Unknown argument` for a field that exists
The running `next dev` is holding a stale generated client. Restart Next.js —
the Python engine can stay up.

### How do I confirm MPS acceleration is active?
`/settings` shows the device badge, or `curl -s localhost:8000/api/health`.

### PostgreSQL container will not start
```bash
docker compose up -d postgres
docker compose ps
```
It runs `postgres:17-alpine` on host port 5440. Note that raising the image's
major version against the existing `namaa_pgdata` volume will fail — dump first.
