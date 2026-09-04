# 🎙️ SILMA Arabic TTS Control Board

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Node.js 24 LTS](https://img.shields.io/badge/Node.js-24%20LTS-green?style=flat&logo=node.js)](https://nodejs.org/)
[![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-blue?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.3-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Apple Silicon MPS](https://img.shields.io/badge/Hardware-M1%20Pro%20(MPS)-silver?style=flat&logo=apple)](https://developer.apple.com/metal/)

A production-grade control board and studio interface designed to run the [silma-ai/silma-tts](https://huggingface.co/silma-ai/silma-tts) model locally on your machine. Includes zero-shot voice cloning from your own audio samples (recorded in the browser or uploaded), speed / fidelity / quality control, batch text processing, preset management, and persistent generation history.

---

## 📑 Table of Contents
- [Key Features](#-key-features)
- [Prerequisites](#-prerequisites)
- [Quick Start (2 Steps)](#-quick-start-2-steps)
- [Features & Usage Guide](#-features--usage-guide)
  - [1. Zero-Shot Voice Cloning](#1-zero-shot-voice-cloning)
  - [2. Emotion & Pacing Modulation](#2-emotion--pacing-modulation)
  - [3. Batch Text Processing](#3-batch-text-processing)
  - [4. Preset Management](#4-preset-management)
  - [5. Generation History & Export](#5-generation-history--export)
- [System Architecture](#-system-architecture)
- [Directory Structure](#-directory-structure)
- [Available Scripts & Commands](#-available-scripts--commands)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ✨ Key Features

- 🕌 **Modern Standard Arabic**: A 150M-parameter F5-TTS/DiT model covering Fusha and English, with automatic diacritization (CATT) and number normalization (NeMo). Note: this is MSA, not Egyptian colloquial — the interface is Egyptian Arabic, the synthesized accent is Fusha.
- 🎤 **Zero-Shot Voice Cloning**: Upload a short sample of your voice (5 to 15 seconds) to synthesize speech in your exact vocal timbre without retraining.
- 🎛️ **Granular Voice Tuning**:
  - **Exaggeration Slider (`0.0` to `1.0`)**: Modulates emotional expressiveness from flat/stoic (`0.0`) to balanced neutral (`0.5`) to dramatic/expressive (`1.0`).
  - **CFG / Pacing Slider (`0.0` to `1.0`)**: Adjusts cadence and tempo without artificial pitch shifts.
- ⚡ **Batch Processing Mode**: Input multiple sentences line-by-line; the engine automatically queues and generates separate audio outputs.
- 💾 **Preset Library**: Save your preferred slider configurations (e.g., "Documentary Narrator", "Excited", "Casual Conversation") and apply them with one click.
- 📜 **Full Generation History**: Paginated, filterable audio logs with inline waveforms, direct downloads (lossless WAV), and one-click retries.
- 🖥️ **Modern RTL Interface**: Crafted with Shadcn/ui, Tailwind CSS v4, and the Cairo typeface, featuring seamless light/dark mode support.
- ⚡ **Apple Silicon Acceleration**: Direct hardware acceleration using Apple Metal Performance Shaders (MPS) via PyTorch, optimized for MacBook M1/M2/M3/M4 with efficient unified memory utilization.

---

## 📋 Prerequisites

Ensure the following tools are installed on your machine:

1. **Operating System**: macOS (optimized for Apple Silicon M1 Pro), Linux, or Windows (WSL2).
2. **Node.js**: **v24+ LTS** (Active LTS) or v22+ LTS.
3. **Python 3.11** — provisioned automatically by `uv`. Not 3.12/3.13: `silma-tts` pins `numpy<=1.26.4`, which has no wheels there.
4. **Homebrew** — for `openfst` (pynini builds against it) and `ffmpeg`.
5. **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
4. **Docker**: For running **PostgreSQL 18** via Docker Compose (or a local PostgreSQL instance).
5. **Disk Space**: At least 5 GB of free space for initial model weight downloads from Hugging Face.

---

## 🚀 Quick Start (2 Steps)

### Step 1: Automated First-Time Setup
Run the bootstrap script from the project root:
```bash
./scripts/setup.sh
```
This automated script will:
- Check Node.js, Python, and Docker requirements.
- Create `.env` from `.env.example`.
- Start the **PostgreSQL 18** Docker container.
- Install Node.js dependencies (`npm install`).
- Apply the database schema via Prisma (`prisma generate` & `prisma db push`).
- Create the Python virtual environment (`tts-engine/venv`) and install ML requirements.
- Initialize local audio storage folders.

### Step 2: Start Development Servers
Launch both the Python TTS backend and the Next.js web application with a single command:
```bash
./scripts/dev.sh
```

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

*(The FastAPI interactive Swagger documentation is accessible at [http://localhost:8000/docs](http://localhost:8000/docs))*

---

## 📖 Features & Usage Guide

### 1. Zero-Shot Voice Cloning
1. Navigate to the **Voices** tab in the sidebar (`/voices`).
2. Click **"+ Add New Voice"**.
3. Drag and drop a clean **WAV** audio file of your voice:
   - **Optimal Duration**: 5 to 15 seconds.
   - **Content**: Speak naturally in conversational Egyptian Arabic (e.g., *"صباح الخير، أنا بجرب التسجيل ده علشان أدرب النموذج على نبرة صوتي"*).
   - **Acoustic Quality**: Quiet room, minimal reverb, no background noise or music.
4. Provide a profile name (e.g., *"My Voice - Ahmed"*) and an optional description.
5. Click **"Save Voice"**.
6. Click **"Set as Default"** if you want this voice profile preselected on the generation board.

### 2. Emotion & Pacing Modulation
On the main Studio page (`/`):
- **Voice Profile**: Select between the default model speaker or any uploaded voice clone profile.
- **Exaggeration Slider**:
  - `0.0 - 0.3` (*Calm / Flat*): Steady, formal cadence suitable for news, narration, or serious audio.
  - `0.5` (*Neutral*): Natural, everyday Egyptian speech.
  - `0.7 - 1.0` (*Expressive / Dramatic*): High dynamic pitch variation and theatrical inflection.
- **CFG / Pacing Slider**:
  - Lower values (`0.2 - 0.4`): Faster, connected speech.
  - Higher values (`0.6 - 0.8`): Slower, spaced words with measured articulation.

### 3. Batch Text Processing
- Toggle the **Batch Mode** switch above the text box.
- Enter multiple sentences, each on its own line:
  ```text
  أهلاً بيك في نظام التوليد الصوتي
  ده تاني سطر وهيطلع في ملف صوتي لوحده
  شكراً لاستخدامك النظام
  ```
- Click **"Generate Speech"**. The system generates all items sequentially and logs each output in your history.

### 4. Preset Management
- Access the **Presets** page (`/presets`) to view and apply pre-configured vocal styles.
- Save your custom slider settings at any time directly from the generation panel using the **"Save as Preset"** dialog.

### 5. Generation History & Export
- The **History** page (`/history`) displays generation metrics: Total Generations, Success Rate, Failed Runs, and Total Audio Duration.
- Filter by voice profile or status, preview audio via the custom player, and download lossless WAV files.

---

## 🏗️ System Architecture

```
[ Browser / User Interface ]
         │  (HTTP / RTL UI)
         ▼
[ Next.js 15 Full-Stack App ] ◄──────► [ PostgreSQL 18 ] (Prisma ORM)
         │
         │  (Multipart Form HTTP Client)
         ▼
[ Python FastAPI Engine ] (Port 8000)
         │
         ▼
[ SILMA TTS / PyTorch ] ──────► Hardware Acceleration (Apple Metal MPS)
         │
         ▼
[ Local Storage Directory ] (storage/audio & storage/voice-samples)
```

---

## 📂 Directory Structure

```
my-tts/
├── .claude/                        # Anthropic Claude 2026 agent configuration & memory
│   ├── rules/                      # Domain-scoped coding & architectural rules
│   ├── commands/                   # Workflows for setup, dev, build, and database
│   ├── settings.json               # Environment versions and command permissions
│   └── project-state.md            # Comprehensive project state & verified status
├── CLAUDE.md                       # Root briefing file for Claude Code agents
├── tts-engine/                     # Python FastAPI sidecar
│   ├── main.py                     # REST endpoints & CORS configuration
│   ├── model_manager.py            # Singleton model manager with MPS hardware detection
│   ├── audio_utils.py              # Audio format & duration validation (torchaudio)
│   └── requirements.txt            # Python dependencies (silma-tts, torch, fastapi) + macOS install notes
├── src/                            # Next.js 15 application
│   ├── app/
│   │   ├── (dashboard)/            # Route group sharing the AppShell layout
│   │   │   ├── page.tsx            # Main TTS studio
│   │   │   ├── voices/             # Voice profile manager
│   │   │   ├── history/            # Generation history & metrics
│   │   │   ├── presets/            # Preset manager & quick styles
│   │   │   └── settings/           # Hardware stats & engine health
│   │   └── api/audio/              # Secure audio streaming route
│   ├── actions/                    # Next.js Server Actions (Prisma & HTTP mutations)
│   ├── hooks/                      # React Query hooks with optimistic cache updates
│   ├── components/                 # Custom domain & Shadcn UI components
│   └── lib/                        # Prisma client, TTS API client, Zod schemas
├── prisma/
│   └── schema.prisma               # Models: VoiceProfile, Generation, Preset
├── storage/                        # Persistent local audio assets
│   ├── audio/                      # Generated WAV speech outputs
│   └── voice-samples/              # Uploaded reference voice samples
├── scripts/
│   ├── setup.sh                    # Automated end-to-end setup script
│   └── dev.sh                      # Dual-service development launcher
└── docker-compose.yml              # PostgreSQL 18 Alpine service definition
```

---

## 🛠️ Available Scripts & Commands

| Command | Purpose |
| :--- | :--- |
| `./scripts/setup.sh` | Full environment setup: checks prerequisites, starts DB, installs all packages |
| `./scripts/dev.sh` | Launches PostgreSQL 18, FastAPI engine, and Next.js dev server together |
| `npm run dev` | Runs only the Next.js development server with Turbopack |
| `npm run build` | Produces an optimized production build of the Next.js application |
| `npm run lint` | Runs ESLint analysis across the project |
| `npx tsc --noEmit` | Performs TypeScript static type checking (currently 0 errors) |
| `npx prisma studio` | Opens the visual database management dashboard in your browser |
| `npx prisma db push` | Pushes the Prisma schema state directly to PostgreSQL |

---

## ❓ Troubleshooting & FAQ

### 1. Why does the very first generation take longer?
**Answer**: On the first request, the engine downloads the full model weights from Hugging Face (~2.5 to 5 GB) into the local cache. Subsequent generations use the preloaded model in memory and take only a few seconds.

### 2. How do I verify Apple Silicon (MPS) acceleration is active?
Visit the **Settings** page (`/settings`) in the control board. The "Device" badge will indicate `MPS`. The `model_manager.py` automatically checks `torch.backends.mps.is_available()` on startup.

### 3. Why are only WAV files accepted for voice samples?
SILMA requires uncompressed, lossless acoustic data to extract fine speaker embeddings. MP3 compression introduces artifacts that degrade voice cloning accuracy. It also needs the **transcription** of the reference clip — record from the built-in teleprompter and it is filled in for you.

### 4. PostgreSQL container failed to start?
Ensure Docker Desktop is running, then run:
```bash
docker compose up -d postgres
```
Verify container health with:
```bash
docker compose ps
```
