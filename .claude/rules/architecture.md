# System Architecture Rules

## Sidecar Pattern
- The Python FastAPI backend (`tts-engine/`) runs as an independent local microservice on port 8000.
- Next.js never directly spawns Python child processes during user requests. All interaction occurs via HTTP calls orchestrated by `src/lib/tts-client.ts`.
- The Next.js frontend runs on port 3000. The database is a local SQLite file (`prisma/namaa.db`) — no server, no container.

## Model Registry (the extension point)
- Backends are adapters in `tts-engine/engines/` implementing `TTSEngine`; `tts-engine/model_registry.py` is the **single** place a model is registered.
- `GET /api/models` serves each model's capabilities *and its parameter schema*; the control board renders its controls from that response. Adding a model is one registry entry and **no frontend change**.
- The chain is: `model_registry.describe_all()` → `GET /api/models` → `src/lib/tts-client.ts:listModels()` → `src/actions/models.ts` → `useModels()` → `ModelSelector` / `ModelParams`.
- `ModelManager` keeps exactly one model resident (16GB unified memory) and owns an `asyncio.Lock` held across both loading and inference, so a swap cannot race a generation.
- Parameter names differ per model, so they travel as a JSON blob (`params`) end to end: form → Server Action → multipart field → engine adapter → `Generation.params`.

## Route Group Structure
- All dashboard pages reside under `src/app/(dashboard)/` and share the common `AppShell` with the persistent sidebar.
- Audio streaming is isolated in `src/app/api/audio/[...path]/route.ts` to allow audio playback from `storage/audio/` and `storage/voice-samples/` without leaking filesystem paths. It normalizes the three path shapes callers hold (`audio/x.wav`, `/storage/audio/x.wav`, and an absolute reference path), resolves and containment-checks against `storage/` (403 otherwise), supports HTTP Range (206 / 416), and destroys the Node stream on `cancel()` — media elements abort mid-flight constantly, and an undestroyed handle raises an *uncaught* "ReadableStream is already closed".

## Server Actions Paradigm
- All data mutations (generating audio, uploading voice profiles, saving presets, deleting history) are implemented as Next.js Server Actions in `src/actions/`.
- Server actions return a standardized response object:
  ```typescript
  { success: boolean; data?: T; error?: string }
  ```
- Server actions call `revalidatePath('/')` upon successful mutations to purge stale cached pages.
- Reference WAVs travel through a Server Action, so `serverActions.bodySizeLimit` in `next.config.ts` is raised to `12mb`.

## Storage Isolation
- Audio files are stored on disk in the project root:
  - `storage/audio/`: Generated speech files (`gen_*.wav`). Always written here, even when the user picks a custom save folder — playback, history and deletion depend on it. A custom folder receives an additional copy, recorded as `Generation.savedPath`.
  - `storage/voice-samples/`: Uploaded reference audio files (`ref_*.wav`).
- These folders are gitignored (except `.gitkeep`).
