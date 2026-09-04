# CLAUDE.md — Arabic TTS Control Board

## Project Overview
A production-grade local control board for text-to-speech and zero-shot voice cloning across **three switchable Arabic models**. Built with Next.js 15, Tailwind CSS v4, Shadcn/ui, React Query v5, React Hook Form v7, Prisma v6, and PostgreSQL 17, communicating with a Python FastAPI inference sidecar.

| id | Model | Dialect | Runtime |
|---|---|---|---|
| `silma` | [silma-ai/silma-tts](https://huggingface.co/silma-ai/silma-tts) | فصحى / MSA | F5-TTS / DiT, 150M |
| `namaa-saudi` | [NAMAA-Space/NAMAA-Saudi-TTS](https://huggingface.co/NAMAA-Space/NAMAA-Saudi-TTS) | سعودي / نجدي | Chatterbox fine-tune |
| `namaa-egyptian` | [NAMAA-Space/NAMAA-Egyptian-TTS](https://huggingface.co/NAMAA-Space/NAMAA-Egyptian-TTS) | مصري | Chatterbox fine-tune |

## Multi-Model Architecture
- Each backend is an adapter under `tts-engine/engines/` implementing `TTSEngine` (`load`, `generate`, `unload`, capability declaration).
- `tts-engine/model_registry.py` is the single place a model is registered. `GET /api/models` serves each model's capabilities **and its parameter schema**, and the UI renders its sliders from that — **adding a model requires no frontend change**.
- `ModelManager` keeps **exactly one model resident** (16GB unified memory); switching unloads the previous one. Switching between the two NAMAA dialects is special-cased via `ChatterboxEngine.adopt()`, which reuses the loaded base and swaps only the fine-tuned `t3` weights (~19s instead of ~50s).
- Parameter names differ per model, so they travel as a JSON blob (`params`) end to end and are stored in `Generation.params` / `Preset.params`. **Never reintroduce per-model columns.**

## Voice Cloning Contract
All three models clone zero-shot from a reference clip, but they differ:
- **SILMA** needs the clip **plus its transcription** (`ref_text`), and silently truncates references over **8.05s** — a truncated clip makes it discard `ref_text` and re-transcribe with Whisper (a 1.6GB download).
- **NAMAA (both)** clone from audio alone; `referenceText` is ignored and there is no length cap.
- `VoiceProfile.referenceText` is stored either way; `createGeneration` enforces it only when the selected model declares `requiresReferenceText`.
- The record-your-voice flow fills it in automatically (the user reads a known script, `src/lib/reference-script.ts`); the upload flow asks for it.

## Architecture
- **Web App**: Next.js 15 (App Router), React 19, TypeScript strict mode, RTL Arabic (Cairo font).
- **TTS Engine**: Python **3.11** FastAPI server running all three models on Apple Silicon MPS (Metal). 3.11 is mandatory — silma-tts pins `numpy<=1.26.4`, which has no wheels for 3.12/3.13.
- **Database**: PostgreSQL 17 (Alpine, Docker, host port **5440**) via Prisma ORM (`prisma/schema.prisma`).
- **Communication**: Next.js Server Actions call FastAPI (`http://localhost:8000/api/*`) via `src/lib/tts-client.ts`.
- **Audio Storage**: Persistent filesystem storage in `storage/audio/` and `storage/voice-samples/`, streamed via Next.js route `src/app/api/audio/[...path]/route.ts`.

## Core Commands
- **Full Setup**: `./scripts/setup.sh` (validates Node 24+ / uv / Homebrew, installs `openfst` + `ffmpeg`, creates the Python 3.11 venv, stages the SILMA install, starts Postgres, generates Prisma, pre-downloads ~2.6GB of weights)
- **Dev Servers**: `./scripts/dev.sh` (runs Postgres container, FastAPI on port 8000, and Next.js on port 3000)
- **Next.js Dev Only**: `npm run dev`
- **Next.js Build**: `npm run build`
- **Type Check**: `npx tsc --noEmit`
- **Database Studio**: `npx prisma studio`
- **Database Schema Push**: `npx prisma db push`
- **Python Fast-Check**: `tts-engine/venv/bin/python -m py_compile tts-engine/*.py tts-engine/engines/*.py`
- **Engine Import Checks**: `tts-engine/venv/bin/python -c 'from silma_tts.api import SilmaTTS'` and
  `tts-engine/venv/bin/python -c 'from chatterbox.mtl_tts import ChatterboxMultilingualTTS'`
- **Live Model List**: `curl -s localhost:8000/api/models` (also reports which one is resident)

## Installing the Engine (why it is not just `pip install silma-tts`)
`pip install silma-tts` **fails on macOS**. Three separate incompatibilities, all handled by `scripts/setup.sh` and documented at the top of `tts-engine/requirements.txt`:
1. `catt-tashkeel` pins `onnxruntime-gpu` (no macOS wheels, CUDA only) → install it `--no-deps` next to the CPU `onnxruntime`, which provides the same import name.
2. `nemo_text_processing` pins `pynini==2.1.6.post1` (no macOS wheels; will not compile against OpenFst 1.8.4) → install it `--no-deps` with `pynini==2.1.7`, built against `brew install openfst`.
3. `torch`/`torchaudio`/`transformers` are pinned to **2.6.0 / 2.6.0 / 5.2.0** — the versions `chatterbox-tts` hard-pins, and the only set where both runtimes coexist. 2.6 is also below the torchaudio 2.9 cutover to `torchcodec`, which needs FFmpeg ≤ 7 while Homebrew ships FFmpeg 9.
4. `HF_HUB_DISABLE_XET=1` is set at the top of `tts-engine/main.py`: HuggingFace's xet transfer stalls indefinitely on some repos (observed on NAMAA-Saudi-TTS — 0 bytes in 10 minutes, then 2.1GB in 175s with it off).

## Code Conventions
- **Language**: TypeScript throughout frontend; Python 3.11 with type hints in `tts-engine/`.
- **Next.js Directives**: Explicitly mark client components with `'use client';` at the very top.
- **Styling**: Tailwind CSS v4 utility classes. CSS variables for theme palette in `src/app/globals.css`.
- **Forms & Validation**: Always use Zod schemas from `src/lib/validations.ts` integrated via `@hookform/resolvers/zod` into `react-hook-form`.
- **State Management**: Use React Query for server data. Server Actions must return `{ success: boolean, data?: T, error?: string }`.
- **RTL & Typography**: Primary UI language is Egyptian Arabic (`dir="rtl"`, `font-family: 'Cairo'`). Audio players and English technical tags (like MPS/Hz) use `dir="ltr"`.

## Tone Axes (how model-agnostic presets work)
`src/lib/tone-axes.ts` maps three shared semantic dials — `pace`,
`expressiveness`, `fidelity` — onto whatever knobs a model declares. Each
*parameter key* (not model id) states which axis it moves and in which
direction, and interpolation is anchored on the parameter's own `default`, so
0.5 always means "leave it neutral" even when the default is off-centre in its
range (SILMA's `speed` defaults to 1.0 inside 0.5–2.0). A model whose knobs map
to no axis simply keeps its defaults — registering a fourth model still needs no
change here.

This backs the studio's persona chips and the presets page's suggestions.
Suggestions whose axes a model cannot express are hidden rather than rendered
as a no-op (NAMAA has no `fidelity` knob, so «جودة عالية» does not appear).

## Modular Claude Docs (.claude/)
- Rules & Standards: `.claude/rules/` (`architecture.md`, `frontend.md`, `backend-ml.md`, `database.md`, `arabic-i18n.md`)
- Custom Workflows: `.claude/commands/` (`setup.md`, `dev.md`, `build.md`, `db.md`)
- Project Inventory & Current State: `.claude/project-state.md`
- Configuration & Permissions: `.claude/settings.json`
