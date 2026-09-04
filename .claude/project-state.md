# Project State & Technical Inventory

**Last Updated**: September 2026  
**Status**: Production-Ready / All Builds & Typechecks Passing (0 Errors)

---

## 1. Executive Summary
The project is a local Text-to-Speech and Zero-Shot Voice Cloning control board for Arabic using [silma-ai/silma-tts](https://huggingface.co/silma-ai/silma-tts) (F5-TTS/DiT, 150M, MSA + English). The interface is Egyptian Arabic; the synthesized accent is Fusha. It pairs a Next.js 15 full-stack frontend application with a dedicated Python FastAPI inference sidecar that leverages Apple Silicon Metal Performance Shaders (MPS) on MacBook M1 Pro hardware.

---

## 2. Current Operational State

| Check | Tool / Command | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Type Check** | `npx tsc --noEmit` | **PASS (0 errors)** | Full TypeScript strictness |
| **Next.js Build** | `npm run build` | **PASS** | 8/8 routes successfully compiled |
| **Prisma Generation** | `npx prisma generate` | **PASS** | Prisma Client v6.19.3 |
| **Python Syntax** | `python3 -m py_compile` | **PASS** | `audio_utils.py`, `model_manager.py`, `main.py` |
| **Node Compatibility** | Node.js v24.16.0 | **PASS** | Active LTS |
| **Hardware Target** | Apple Silicon M1 Pro | **CONFIGURED** | MPS acceleration with CPU fallback |

---

## 3. Technology Stack & Versions

- **Runtime**: Node.js v24 (Active LTS) & Python 3.10+
- **Frontend Framework**: Next.js 15.5+ (App Router)
- **UI Framework**: React 19
- **CSS / Styling**: Tailwind CSS v4.3+ (CSS-first config)
- **Component Primitives**: Radix UI / Shadcn UI (19 components)
- **Icons**: Hugeicons (`@hugeicons/react` & `@hugeicons/core-free-icons`) and Lucide React
- **State Management**: TanStack React Query v5.102+
- **Form Management**: React Hook Form v7.87+ with `@hookform/resolvers/zod`
- **Validation**: Zod v3.24+
- **Database Engine**: PostgreSQL 18 Alpine (Docker containerized)
- **Database ORM**: Prisma v6.19+
- **ML Framework**: PyTorch / torchaudio with MPS backend
- **TTS Engine**: SILMA TTS (F5-TTS/DiT, 150M, MSA + English) with CATT diacritization and NeMo normalization
- **Audio Serving**: Next.js custom stream handler with Range header support

---

## 4. Complete File Inventory

### Configuration & Automation
- `package.json`: Dependency manifests with modern 2026 versions and Node 24 engine lock.
- `tsconfig.json`: Strict TypeScript compiler options with `@/*` path mapping.
- `next.config.ts`: Next.js 15 configuration with standalone output readiness.
- `postcss.config.mjs`: PostCSS plugin configuration for `@tailwindcss/postcss`.
- `docker-compose.yml`: PostgreSQL 18 Alpine service configuration with persistent volumes and health checks.
- `.env.example` & `.env`: Local environment configurations (`DATABASE_URL`, `TTS_ENGINE_URL`, `NEXT_PUBLIC_TTS_ENGINE_URL`, paths).
- `.gitignore`: Ignoring dependencies, build outputs, and local audio assets.
- `scripts/setup.sh`: Automated bash setup sequence with version detection and database bootstrap.
- `scripts/dev.sh`: Process-managed launcher starting Postgres, FastAPI, and Next.js concurrently.

### Claude Agent Documentation (`.claude/` & `CLAUDE.md`)
- `CLAUDE.md`: Concise root briefing file (<200 lines) for Claude Code agent sessions.
- `.claude/settings.json`: Configuration, permissions, and tool guardrails.
- `.claude/project-state.md`: This comprehensive system inventory document.
- `.claude/rules/architecture.md`: Sidecar pattern, server action standards, and storage rules.
- `.claude/rules/frontend.md`: React 19, Tailwind v4, Shadcn, and React Query conventions.
- `.claude/rules/backend-ml.md`: Python FastAPI, SILMA TTS, and Apple Silicon MPS rules.
- `.claude/rules/database.md`: PostgreSQL 18, Prisma singleton, and schema rules.
- `.claude/rules/arabic-i18n.md`: Cairo font, RTL directionality, and Egyptian Arabic terminology.
- `.claude/commands/setup.md`: Guide for `./scripts/setup.sh`.
- `.claude/commands/dev.md`: Guide for `./scripts/dev.sh`.
- `.claude/commands/build.md`: Guide for production build and type checking.
- `.claude/commands/db.md`: Guide for Prisma migrations, pushes, and Studio.

### Python TTS Sidecar (`tts-engine/`)
- `tts-engine/requirements.txt`: Python package requirements (`silma-tts`, `fastapi`, `uvicorn`, `torch==2.8.0`, `torchaudio==2.8.0`) plus the macOS staged-install notes.
- `tts-engine/main.py`: FastAPI server exposing:
  - `POST /api/generate`: Synthesizes text with an optional reference clip + its transcription, plus `speed`, `cfg_strength`, `nfe_step` and `seed`.
  - `POST /api/upload-reference`: Validates and stores 3-30s WAV voice samples.
  - `GET /api/voices`: Lists stored voice clone samples.
  - `DELETE /api/voices/{filename}`: Deletes reference audio sample.
  - `GET /api/health`: Health status, uptime, and MPS device status.
  - `GET /api/model-info`: Detailed architecture and parameter information.
- `tts-engine/model_manager.py`: Singleton manager handling thread-safe inference (`asyncio.Lock`) and hardware selection (`mps` vs `cpu`).
- `tts-engine/audio_utils.py`: Audio validation (WAV format, duration checks, sample rate inspection via `torchaudio`).

### Full-Stack Next.js Application (`src/`)
- **Global Configuration**:
  - `src/app/globals.css`: Tailwind CSS v4 variables, light/dark color definitions, Cairo font import.
  - `src/app/layout.tsx`: Root HTML layout setting Arabic `dir="rtl"`, `ThemeProvider`, and `QueryProvider`.
  - `src/providers/query-provider.tsx`: Client-side React Query Provider configuration.
- **Route Groups & Pages**:
  - `src/app/(dashboard)/layout.tsx`: Wraps all pages in `AppShell` with the persistent sidebar navigation.
  - `src/app/(dashboard)/page.tsx`: Main generation studio with `GenerationForm` and recent results preview.
  - `src/app/(dashboard)/voices/page.tsx`: Voice cloning management with upload dialog and voice profile cards.
  - `src/app/(dashboard)/history/page.tsx`: Searchable, filterable generation history with metrics cards.
  - `src/app/(dashboard)/presets/page.tsx`: Preset management with recommended quick-add styles.
  - `src/app/(dashboard)/settings/page.tsx`: Engine connection controls, hardware metrics (MPS), and diagnostics.
  - `src/app/api/audio/[...path]/route.ts`: Streaming API route serving audio files directly from `storage/`.
- **Server Actions (`src/actions/`)**:
  - `src/actions/generation.ts`: Handles generation submissions, database status updates, and audio file cleanup.
  - `src/actions/voice-profiles.ts`: Handles file uploads to the TTS engine and database synchronization.
  - `src/actions/presets.ts`: Manages creation, updating, and listing of voice presets.
- **React Query Hooks (`src/hooks/`)**:
  - `src/hooks/use-generations.ts`: Queries and mutations for generation history.
  - `src/hooks/use-voice-profiles.ts`: Queries and mutations for voice profiles.
  - `src/hooks/use-presets.ts`: Queries and mutations for voice parameter presets.
  - `src/hooks/use-engine-status.ts`: 10-second polling query for engine connection health.
- **UI Components (`src/components/`)**:
  - `src/components/studio/studio-telemetry.tsx`: Live Apple Silicon M1 Pro MPS telemetry, 24kHz HiFi-GAN badge, and studio mode switcher.
  - `src/components/generation/master-audio-dock.tsx`: Floating frosted-glass master audio dock with interactive scrubber, speed chips, and lossless export.
  - `src/components/generation/text-input.tsx`: Arabic RTL text input area with 5 Egyptian Persona cards, word/syllable counters, and speech duration estimation.
  - `src/components/generation/voice-controls.tsx`: Sliders with dynamic real-time acoustic equalizer visualizer, emotion/pacing badges, inline voice audition, and Hugeicons.
  - `src/components/generation/audio-player.tsx`: Studio audio player with playback speed toggles (1x-2x), restart, copy link, and lossless WAV download.
  - `src/components/generation/generation-form.tsx`: Primary form supporting single generation, multi-line batch mode, keyboard shortcuts (Cmd+Enter), and neural pipeline tracking.
  - `src/components/tour/onboarding-tour.tsx`: Interactive first-time launch onboarding tour with dynamic spotlight element highlighting and keyboard navigation.
  - `src/components/voices/voice-card.tsx`: Profile card with preview playback and default voice toggle.
  - `src/components/voices/upload-dialog.tsx`: Drag-and-drop WAV upload with validation.
  - `src/components/history/generation-list.tsx`: Paginated generation table with retry, delete, and download buttons.
  - `src/components/layout/app-shell.tsx`: Responsive application container with mobile drawer and onboarding tour mounting.
  - `src/components/layout/sidebar.tsx`: Fixed sidebar with navigation links and engine status pill.
  - `src/components/layout/header.tsx`: Header bar with theme switcher and "Take Tour" launcher button.
  - `src/components/layout/engine-status.tsx`: Real-time engine health badge with device identifier.
  - `src/components/ui/*`: 19 accessible Shadcn UI components (`button`, `dialog`, `select`, `slider`, `switch`, etc.).
- **Library Utilities (`src/lib/`)**:
  - `src/lib/prisma.ts`: Prisma Client singleton with connection pooling protection.
  - `src/lib/tts-client.ts`: Typed API client communicating with FastAPI over multipart HTTP.
  - `src/lib/validations.ts`: Zod schemas for generation inputs, voice profiles, and presets.
  - `src/lib/utils.ts`: Duration, file size, and Tailwind `cn` utility formatters.

### Database (`prisma/schema.prisma`)
- **`VoiceProfile`**: Holds reference audio file paths, durations, and `isDefault` flags.
- **`Generation`**: Records input text, output audio paths, duration, file size, parameter settings, and `GenerationStatus` enum (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- **`Preset`**: Stores named configurations of `speed`, `cfgStrength` and `nfeStep` values.

---

## 5. Storage Directories
- `storage/audio/`: Local persistent storage for synthesized `.wav` speech files.
- `storage/voice-samples/`: Local persistent storage for uploaded voice clone `.wav` reference clips.
Both directories are tracked via `.gitkeep` and excluded from git version control.
