# 🎙️ Arabic TTS Control Board — `voicetut` branch

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Node.js 24 LTS](https://img.shields.io/badge/Node.js-24%20LTS-green?style=flat&logo=node.js)](https://nodejs.org/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776ab?style=flat&logo=python)](https://www.python.org/)
[![SQLite](https://img.shields.io/badge/SQLite-file--based-003b57?style=flat&logo=sqlite)](https://www.sqlite.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.3-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Apple Silicon MPS](https://img.shields.io/badge/Hardware-M1%20Pro%20(MPS)-silver?style=flat&logo=apple)](https://developer.apple.com/metal/)

A local control board for Arabic text-to-speech and zero-shot voice cloning.
Record a reference clip, paste your script, generate. Nothing leaves the laptop.

**This branch runs one model: VoiceTut.** It is the one that actually reproduces
a speaker's voice.

| id | Model | Dialect | Runtime | Parameters |
|---|---|---|---|---|
| `voicetut` | [mohammedaly22/VoiceTut-TTS](https://huggingface.co/mohammedaly22/VoiceTut-TTS) | مصري + AR/EN code-switch | OmniVoice — Qwen3-0.6B + Higgs codec, 0.6B | `guidanceScale`, `speed`, `numStep` |

Four other adapters — SILMA (Fusha), NAMAA Saudi, NAMAA Egyptian and Masri Higgs
— are still in `tts-engine/engines/` and still work. They are **unregistered**,
not deleted: add an id back to `MODEL_IDS` in `tts-engine/model_registry.py` and
the model reappears in the dropdown with no other change. See
[Why only VoiceTut?](#-why-only-voicetut) for the reasoning.

---

## 📑 Table of Contents
- [Key Features](#-key-features)
- [Why only VoiceTut?](#-why-only-voicetut)
- [What it costs to run](#-what-it-costs-to-run)
- [Writing a script the model can read](#-writing-a-script-the-model-can-read)
- [Prerequisites](#-prerequisites)
- [Quick Start (2 Steps)](#-quick-start-2-steps)
- [Features & Usage Guide](#-features--usage-guide)
- [System Architecture](#-system-architecture)
- [Re-enabling another model](#-re-enabling-another-model)
- [Directory Structure](#-directory-structure)
- [Available Scripts & Commands](#-available-scripts--commands)
- [Engine API](#-engine-api)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ✨ Key Features

- 🎯 **Voice cloning that actually holds**: VoiceTut was trained on ~380 h of Egyptian *podcast* speech across many speakers, and its authors published a speaker-similarity figure (0.83). Give it 3–10 s of you plus that clip's transcript.
- 🧩 **The UI is built from the engine's schema**: `GET /api/models` publishes each model's capabilities *and its parameter list*, and the control board renders its sliders from that. Registering a model needs no frontend change.
- 🎤 **Record in the browser**: a built-in teleprompter, or upload a WAV. Raw capture (echo cancellation, noise suppression and AGC all off) because that processing degrades the timbre the cloner depends on.
- ✍️ **Your punctuation is respected**: a blank line is a hard stop with a real breath, `..` is a rhetorical pause *inside* a sentence, and a trailing `:` gets its beat. See [Writing a script](#-writing-a-script-the-model-can-read).
- 📁 **Choose where files land**: a save-folder picker backed by the engine's filesystem endpoints; the canonical copy always stays in `storage/audio/` so history and playback keep working.
- 🔊 **No clipping**: neural vocoders routinely peak above full scale, which `torchaudio.save` would hard-clip into audible crackle. Output is scaled to 0.99 only when it exceeds 1.0, so loudness stays comparable between takes.
- ⚡ **Batch mode**: one clip per line.
- 💾 **Model-scoped presets** and 📜 **full generation history** with inline players, downloads and retries.
- 🖥️ **RTL Egyptian-Arabic interface**: Shadcn/ui, Tailwind CSS v4, the Cairo typeface, light/dark.
- 🚀 **Apple Silicon acceleration** via Metal Performance Shaders (MPS), with CPU fallback.

---

## 🔍 Why only VoiceTut?

Four Arabic models were built into this board before it. VoiceTut is the only
one that reproduces *your* voice reliably, and it is also the cheapest to run.

|  | VoiceTut | Masri Higgs | SILMA | NAMAA ×2 |
|---|---|---|---|---|
| Size | **0.6B** | 4B | 150M | ~1B |
| Clones from | clip **+ transcript** | clip + transcript | clip + transcript | clip alone |
| Reference band | **3–10 s** | 6 s cap | 8.05 s cap | none |
| Speaker similarity | **0.83, published** | never evaluated | — | — |
| Warm load | **~4–7 s** | ~210 s | ~13 s | ~37 s |
| RTF | **1.76×** | 7.29× | <1× | ~1× |
| Peak GPU | **3.5 GB** (fp32) | 8.7 GB | ~0.9 GB | ~0.9 GB |
| Licence | **Apache-2.0** | creator-only | open | open |

**Masri Higgs is the instructive failure.** It is a 4B model that reads Egyptian
beautifully — in one voice. Its LoRA was trained on 98 hours of a *single*
narrator, and speaker identity collapsed onto him; its model card concedes
speaker similarity was never re-benchmarked after the fine-tune. Its take-to-take
drift is large enough (±26 Hz median F0 on an **identical** reference) that a
single A/B sample cannot tell you whether a reference landed at all — a trap
worth remembering before concluding anything from one pair of clips. The audio
codec is not at fault: a decode→encode round trip of its own shipped references
agrees with them 79% on codebook 0, and MPS encoding is bit-identical to CPU.

VoiceTut, by contrast, was trained across many podcast speakers and ships 17
reference voices. It reuses the *same* Higgs audio codec, so the vendored
back-port at `tts-engine/engines/vendor/higgs_codec` carries straight over.

---

## 💻 What it costs to run

Measured on an M1 Pro (16 GB unified memory), fp32 on MPS, with an 8.94 s
reference:

```
after load       weights 2337 MB   driver 2346 MB
after generate   weights 2337 MB   driver 3453 MB   ← peak
after unload     weights    0 MB   driver    3 MB   ← clean, no leak
```

**~3.5 GB peak at fp32**; weights are constant and generation adds ~1.1 GB of
activations. In fp16 that is ~2.9 GB, matching the model card's T4 figure.

| VRAM | fp32 | fp16 |
|---|---|---|
| 4 GB | tight | comfortable |
| 6 GB (e.g. RTX 3050) | fits | comfortable |
| 8 GB+ | fine | fine |

Two things that change the number:

1. **Generate without a reference transcript and it loads Whisper
   large-v3-turbo** (1.6 GB) to transcribe the clip. Always store a
   `referenceText` and this never happens.
2. **Longer references cost more**, in both memory and time — RTF went 2.51× →
   3.88× moving from a 9 s reference to a 23 s one.

The adapter hardcodes `dtype="float32"`; fp16 is untested here and is a one-line
change in `engines/voicetut_engine.py`.

---

## ✍️ Writing a script the model can read

Your punctuation decides where the voice stops. Each chunk is generated
separately, so this is also what keeps long text from drifting.

| you write | you get |
|---|---|
| blank line | hard stop — one chunk per paragraph, 0.38 s of silence |
| `.` `؟` `!` | sentence end; sentences are **packed** together up to 220 chars |
| `:` at end of line | a beat before what follows |
| `..` `...` `…` | rhetorical pause **inside** a sentence — never a break |
| `،` | short pause, rendered by the model |

```
السلام عليكم ورحمة الله وبركاته.

بس مبدئيا كده.. خليني أسألك سؤال:

تفتكر إيه الشيء المشترك بين موبايلك.. وشوية الرملة اللي على الشط؟
```

Three paragraphs, three chunks. `كده..` and `موبايلك..` stay *inside* their
sentences, so the question keeps one intonation contour instead of being cut in
half.

**Tashkeel is optional** — VoiceTut's normalizer strips incoming harakat and
re-adds its own, so diacritics change nothing in the output. Keep them only if
they help you read.

---

## 📋 Prerequisites

1. **Operating System**: macOS on Apple Silicon (what this is tuned for). Linux works; the Homebrew steps become your distro's equivalents.
2. **Node.js**: **v24+ LTS**.
3. **Python 3.11** — provisioned automatically by `uv`. Not 3.12/3.13: `silma-tts` pins `numpy<=1.26.4`, which has no wheels there.
4. **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
5. **Homebrew** — for `openfst` (pynini compiles against it) and `ffmpeg`.
6. **No database server** — the database is a SQLite file at `prisma/namaa.db`. No Docker, no container. (Docker Desktop's VM held ~2 GB that the models are better off with.)
7. **Disk space**: ~2.3 GB of VoiceTut weights, plus ~3 GB of Python packages.

---

## 🚀 Quick Start (2 Steps)

### Step 1: Automated First-Time Setup
```bash
./scripts/setup.sh
```
Checks prerequisites, creates `.env`, installs Node dependencies, creates the
SQLite database, builds the Python 3.11 environment — including the packages
that cannot be pip-installed on macOS as published, and VoiceTut's OmniVoice
backbone which installs `--no-deps` (see
[the transformers pin](#omnivoice-wants-transformers-53-but-we-are-pinned-to-52)) —
and pre-downloads the weights so your first generation is not a long wait.

### Step 2: Start Development Servers
```bash
./scripts/dev.sh
```
Starts the FastAPI engine on a Unix socket (`storage/run/engine.sock`, no port) and Next.js on the first free port from **43117**. Ctrl+C stops
both. There is no database process to start.

👉 the URL `dev.sh` prints — **http://127.0.0.1:43117** unless something else holds it
*(The engine has no port, so no Swagger in the browser; `curl --unix-socket storage/run/engine.sock http://e/openapi.json` gets the schema.)*

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
3. **Upload tab** — drop a clean WAV from a quiet room, no music. **Aim for
   8–10 s** and supply the transcript of *exactly* that clip: VoiceTut does not
   truncate when a transcript is given (deliberately, so audio and text stay
   aligned), so an over-long clip is used whole and quality degrades silently.
4. Optionally **تعيين كافتراضي**.

A profile missing its transcription shows a `ناقص نص العينة` badge. Fill it in —
without it the engine loads Whisper large-v3-turbo (1.6 GB) to transcribe the
clip on every cold start.

> **The reference is where style comes from.** Timbre transfers from almost any
> clean clip, but *delivery* — your pacing, your pauses, your emphasis — only
> transfers if the reference contains it. A flat single sentence gives you your
> voice reading someone else's rhythm. Record yourself speaking the way you
> actually present.

### 2. Generate
On the studio page (`/`):
- **نموذج النطق** — VoiceTut on this branch. Badges show its dialect, that it
  needs reference text, and its 10 s clip guidance.
- **الصوت** — the default sample or one of your profiles.
- **Parameters** — rendered from the selected model's own schema:
  - `الالتزام بالعينة` (guidance) 1–5, default 2.0 — how hard to stick to the reference
  - `سرعة الإلقاء` 0.5–2, default 1.0
  - `خطوات التوليد` (diffusion steps) 8–64, default 32 — quality vs speed
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
«سريع» resolves against whichever model is selected using its own ranges and
defaults, and a suggestion a model cannot express is simply not offered. Presets carry their model id, so the studio dropdown only lists the
ones matching the model you have selected.

### 5. History
`/history` shows totals, success rate and cumulative duration, filterable by
voice and status, with inline playback, WAV download, retry (which reuses the
original model and parameters) and delete. Rows generated by the now-unregistered
models keep their own labels — `LEGACY_MODEL_ID` in `src/lib/models.ts` exists
precisely so unregistering a model never relabels your history.

---

## 🏗️ System Architecture

```
[ Browser / RTL UI ]
         │
         ▼
[ Next.js 15 App ] ◄──────► [ SQLite  prisma/namaa.db ] (Prisma ORM)
         │
         │  multipart HTTP — src/lib/tts-client.ts
         ▼
[ FastAPI engine  unix:storage/run/engine.sock ]
         │
         ├── model_registry.py ── the one place a model is registered
         │
         ▼
[ ModelManager ] ── one model resident, asyncio.Lock ── MPS (Metal)
         │
         ├── engines/voicetut_engine.py    → voicetut   ← registered
         ├── engines/silma_engine.py       → silma       (unregistered)
         ├── engines/chatterbox_engine.py  → namaa-*     (unregistered)
         ├── engines/higgs_engine.py       → masri-higgs (unregistered)
         └── engines/vendor/higgs_codec/   → codec back-ported from transformers 5.17
         │
         ▼
[ storage/audio · storage/voice-samples ]
```

---

## 🧩 Re-enabling another model

The other four adapters are on disk and working. To bring one back:

```python
# tts-engine/model_registry.py
MODEL_IDS: List[str] = ["voicetut", "namaa-egyptian"]
```

That is the whole change. `GET /api/models` picks it up, the selector lists it,
and the sliders render from its own schema. `describe_all()` is driven by
`MODEL_IDS`, so there is no second list to keep in sync.

**Adding a genuinely new model:** write an adapter in `tts-engine/engines/`
implementing `TTSEngine` — `load()`, `generate()`, `unload()`, and a
`describe()` carrying its metadata and parameter list — then add its id to
`MODEL_IDS`. There is no frontend step.

Three hard requirements:

- `unload()` must actually release the weights (drop refs, `gc.collect()`,
  `torch.mps.empty_cache()`) or switching will OOM a 16 GB machine.
- Parameter keys must never become database columns — they belong in the
  `params` blob.
- **Anything Qwen3-based must force `eager` attention on MPS.** `sdpa` aborts
  the whole process inside `mps_matmul`; it cannot be caught. Both
  `higgs_engine` and `voicetut_engine` do this.

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
│   ├── main.py                     # REST endpoints (Unix socket), merge, HF_HUB_DISABLE_XET
│   ├── model_registry.py           # ← the single place a model is registered
│   ├── model_manager.py            # one-resident-model manager, MPS detection, locking
│   ├── audio_utils.py              # validation, peak normalization, folder browsing
│   ├── progress.py                 # single tracker behind GET /api/progress
│   ├── engines/
│   │   ├── base.py                 # the TTSEngine interface
│   │   ├── voicetut_engine.py      # ← the registered model
│   │   ├── silma_engine.py         # SILMA (F5-TTS), unregistered
│   │   ├── chatterbox_engine.py    # both NAMAA dialects, unregistered
│   │   ├── higgs_engine.py         # Masri Higgs 4B, unregistered
│   │   └── vendor/higgs_codec/     # codec back-ported from transformers 5.17
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
│   └── lib/                        # prisma, tts-client, validations, audio-encode,
│                                   #   reference-script, tone-axes, models
├── prisma/
│   ├── schema.prisma               # VoiceProfile, Generation, Preset
│   └── namaa.db                    # the database — one file, gitignored
├── storage/                        # audio/ and voice-samples/ (gitignored)
└── scripts/                        # setup.sh, dev.sh
```

---

## 🛠️ Available Scripts & Commands

| Command | Purpose |
| :--- | :--- |
| `./scripts/setup.sh` | Full environment setup, including ~2.3 GB of model weights |
| `./scripts/dev.sh` | Launches the FastAPI engine and Next.js together |
| `npm run dev` | Next.js dev server only (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript strict check (currently 0 errors) |
| `npx prisma studio` | Visual database browser |
| `npx prisma migrate deploy` | Create/upgrade `prisma/namaa.db` from `prisma/migrations/` |
| `tts-engine/venv/bin/python -m py_compile tts-engine/*.py tts-engine/engines/*.py` | Python syntax check |
| `curl -s --unix-socket storage/run/engine.sock http://e/api/models` | Registry + which model is resident |
| `curl -s --unix-socket storage/run/engine.sock http://e/api/progress` | Live state of the running generation |

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
| `GET /api/progress` | Live job state: `loading`/`generating`/`idle`, current chunk, elapsed. Polled once a second by the studio. |

---

## ❓ Troubleshooting & FAQ

### My voice sample sounds like me, but the *style* is wrong
Style lives in the reference clip, not the model. Timbre transfers from almost
any clean recording; pacing, pauses and emphasis only transfer if the reference
actually contains them. A 5 s flat declarative sentence gives you your voice
reading someone else's rhythm. Re-record 8–10 s of yourself **presenting the way
you present**, and store the transcript of exactly that clip.

### Why does the first generation take so long?
The model is being loaded, and on a fresh machine downloaded (2.28 GB). Warm
load is ~4–7 s; the first one after a download is much slower purely from
first-touch disk reads.

### The engine is downloading Whisper — why?
A generation ran with no `referenceText`. VoiceTut then transcribes the
reference clip itself with Whisper large-v3-turbo (1.6 GB, cached at
`~/.cache/huggingface/hub/models--openai--whisper-large-v3-turbo`). Fill in the
profile's reference text and it never loads.

### My long text switches voice partway through
Each chunk is generated separately, so a script that splits into many chunks
gives the model many chances to drift. Two things help: **use blank lines** so
the split happens where you intend, and keep paragraphs substantial — sentences
are packed together up to 220 characters rather than generated one at a time.
See [Writing a script](#-writing-a-script-the-model-can-read).

### OmniVoice wants transformers 5.3, but we are pinned to 5.2
Deliberate, and it works. The `>=5.3.0` pin exists for exactly one class,
`HiggsAudioV2TokenizerModel`; the other 15 symbols OmniVoice imports all exist
in 5.2.0. That class is vendored at `tts-engine/engines/vendor/higgs_codec` and
registered into the `transformers` namespace by
`voicetut_engine._install_codec_shim()`. So `omnivoice` and `voicetut-tts`
install `--no-deps`, and the pin that chatterbox needs stays intact.

The shim patches **both** `transformers` and `sys.modules["transformers"]` —
they are different objects, because transformers replaces itself with a
`_LazyModule`. Patching only the former leaves `from transformers import ...`
still raising `ImportError` while `hasattr()` returns `True`.

### `ValueError: Using a device_map ... requires accelerate`
VoiceTut loads with `device_map=`, which transformers refuses without
`accelerate`. `setup.sh` installs it `--no-deps`.

### `LLVM ERROR` / `mps_matmul: incompatible dimensions`
Qwen3 with `sdpa` attention on Metal. It aborts the process, so it cannot be
caught. `voicetut_engine` forces `eager` on MPS; any other Qwen3-based engine
must do the same.

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
wheels; and Python must be 3.11 for `numpy<=1.26.4`. SILMA is unregistered on
this branch but still installed, because the venv is shared.

### A generation says "fetch failed" but the WAV was written anyway
Node's fetch gives up at its 5-minute default while the engine is still
rendering: the file lands on disk but the app never hears back, so the row is
marked FAILED with no duration. `generateSpeech()` uses undici's own `fetch`
with a 1-hour dispatcher. It must be undici's `fetch` and not the global one —
Node's built-in fetch runs on a *bundled* copy of undici and rejects a
dispatcher from the npm package with `invalid onRequestStart method`.

### `ModuleNotFoundError: No module named 'fastapi'` when starting the engine
A stale `VIRTUAL_ENV` inside `venv/bin/activate` (usually from renaming the venv
directory) puts a nonexistent path on `PATH` and a pyenv shim wins. `dev.sh`
calls the venv binaries by absolute path for exactly this reason; if you start
uvicorn by hand, do the same.

### Prisma reports `Unknown argument` for a field that exists
The running `next dev` is holding a stale generated client. Restart Next.js —
the Python engine can stay up.

### How do I confirm MPS acceleration is active?
`/settings` shows the device badge, or `curl -s --unix-socket storage/run/engine.sock http://e/api/health`.

### Where is the database?
`prisma/namaa.db` — one SQLite file, no server and no container. Back it up by
copying it; `npx prisma migrate deploy` recreates it from scratch. It replaced a
dockerised PostgreSQL 17 because Docker Desktop's VM held ~2 GB the models are
better off with. SQLite takes a write lock per transaction, which is fine for
one person generating one clip at a time and is the first thing that would break
under concurrent writers.

### The progress panel is frozen on a stale snapshot
It should not be — but if it is reintroduced as a Server Action it will be.
Next.js runs Server Actions **serially per client**, so a poll written as an
action queues behind the generation it is reporting on and only resolves once
that finishes. Progress is a Route Handler (`src/app/api/progress/route.ts`) for
this reason. Keep it one.
