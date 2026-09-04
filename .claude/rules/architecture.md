# System Architecture Rules

## Sidecar Pattern
- The Python FastAPI backend (`tts-engine/`) runs as an independent local microservice on port 8000.
- Next.js never directly spawns Python child processes during user requests. All interaction occurs via HTTP calls orchestrated by `src/lib/tts-client.ts`.
- The Next.js frontend runs on port 3000.

## Route Group Structure
- All dashboard pages reside under `src/app/(dashboard)/` and share the common `AppShell` with the persistent sidebar.
- Audio streaming is isolated in `src/app/api/audio/[...path]/route.ts` to allow audio playback from `storage/audio/` and `storage/voice-samples/` without leaking filesystem paths.

## Server Actions Paradigm
- All data mutations (generating audio, uploading voice profiles, saving presets, deleting history) are implemented as Next.js Server Actions in `src/actions/`.
- Server actions return a standardized response object:
  ```typescript
  { success: boolean; data?: T; error?: string }
  ```
- Server actions call `revalidatePath('/')` upon successful mutations to purge stale cached pages.

## Storage Isolation
- Audio files are stored on disk in the project root:
  - `storage/audio/`: Generated speech files (`gen_*.wav`).
  - `storage/voice-samples/`: Uploaded reference audio files (`ref_*.wav`).
- These folders are gitignored (except `.gitkeep`).
