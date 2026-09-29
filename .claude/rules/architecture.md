# System Architecture Rules

## Sidecar Pattern
- The Python FastAPI backend (`tts-engine/`) runs as an independent local microservice listening on a **Unix domain socket**, `storage/run/engine.sock` — not a TCP port. 8000 and 3000 collided with other projects, and no port is ever guaranteed free. `SAWTAK_ENGINE_SOCKET` overrides the path in all four places that derive it (`tts-engine/main.py`, `scripts/dev.sh`, `electron/processes.js`, `src/lib/tts-client.ts`); `TTS_ENGINE_URL` switches the client back to TCP.
- The socket directory is created **0700**: uvicorn chmods the socket itself 0666, so the directory is what keeps other users out. macOS caps a socket path at 103 bytes; the launchers check and say so. A socket file nobody answers on is stale and is removed before starting — `--reload` fails with EADDRINUSE rather than replacing it.
- All engine calls go through undici's `fetch` with an `Agent({ connect: { socketPath } })`. The global `fetch` cannot reach a socket, and the browser cannot at all — which is why the engine has no CORS middleware and why every browser-facing engine read is a Route Handler proxy.
- Next.js never directly spawns Python child processes during user requests. All interaction occurs via HTTP calls orchestrated by `src/lib/tts-client.ts`.
- The Next.js server needs a TCP port for the browser, but not a well-known one, and binds `127.0.0.1` only. The desktop app lets the OS pick one (port 0) and loads it in its own window; `scripts/dev.sh` starts at 43117 (`SAWTAK_WEB_PORT`) and walks up past anything listening. Electron also takes a single-instance lock, so a second launch focuses the first window instead of starting a second server. The database is a local SQLite file (`prisma/namaa.db`) — no server, no container.

## Model Registry (the extension point)
- Backends are adapters in `tts-engine/engines/` implementing `TTSEngine`; `tts-engine/model_registry.py` is the **single** place a model is registered.
- `GET /api/models` serves each model's capabilities *and its parameter schema*; the control board renders its controls from that response. Adding a model is one registry entry and **no frontend change**.
- The chain is: `model_registry.describe_all()` → `GET /api/models` → `src/lib/tts-client.ts:listModels()` → `src/actions/models.ts` → `useModels()` → `ModelSelector` / `ModelParams`.
- `ModelManager` keeps exactly one model resident (16GB unified memory) and owns an `asyncio.Lock` held across both loading and inference, so a swap cannot race a generation.
- Parameter names differ per model, so they travel as a JSON blob (`params`) end to end: form → Server Action → multipart field → engine adapter → `Generation.params`.

## Desktop App Layout
- `electron/processes.js` `resolveLayout()` decides everything that differs between installed and checkout: data root (`app.getPath('userData')` = `~/Library/Application Support/Sawtak` vs the repo), database path (`sawtak.db` vs `prisma/namaa.db`), Python (`Resources/python/bin/python3.11` vs `tts-engine/venv`) and engine dir (`Resources/engine` vs `tts-engine/`).
- Launch order: `prepareData()` (create folders, `prisma migrate deploy`) → engine → first-launch-only `importBuiltinVoices()` in the background → Next → window.
- The web server prefers port 43117 so the page's origin — and its localStorage — is stable across launches, and falls back to any free port.
- The baked `electron/data-root.json` (the build machine's repo path) is gone; nothing in the bundle refers to where it was built.

## Projects (long-form work)
- Three levels. A `Project` is a container (channel, series, client) with no audio. An `Episode` belongs to one project and is one finished piece of audio — `kind` is `episode`, `short` or `other` (`EPISODE_KINDS` in `src/lib/projects.ts`, a plain string so adding one needs no migration). An episode's segments are `Generation` rows (`episodeId`, `position`).
- Voice settings (`modelId`, `voiceProfileId`, `params`, `outputDir`, `gapMs`) live on the episode. `createEpisode` copies them from the project's most recently edited episode, since a series usually shares a narrator.
- Actions: `src/actions/projects.ts` (project CRUD, episode summaries) and `src/actions/episodes.ts` (episode CRUD, segments, merge). Hooks: `use-projects.ts`, `use-episodes.ts`.
- Segments are queued as PENDING rows first (`addSegments`) and rendered one at a time by the page (`useRenderQueue` → `renderSegment`), so a long episode survives navigating away — "ولّد الباقي" picks up whatever is not COMPLETED.
- **Each segment has its own voice** (`Generation.voiceProfileId`), so an episode can have more than one speaker. The episode's voice is only what *new* segments get. A retake keeps the segment's voice and takes the sidebar's model and knobs; `retakeSegment` ignores `settings.voiceProfileId` on purpose — taking the sidebar voice implicitly made a retake re-voice segments silently, and a queued segment kept the voice it was queued with, so fixing a wrong voice looked like it did nothing. Change one segment's voice from its voice chip (`setSegmentVoice` when it has no audio, a retake with `voiceProfileId` when it has audio); "خلّي كل المقاطع بالصوت ده" (`applyVoiceToSegments`) re-voices queued segments directly and returns the finished ones, which the page re-renders through `useRenderQueue.start(ids, { voiceProfileId })` after confirming.
- A retake renders **into the same row**, keeping its slot. If it fails, the old take, text and settings stay (`renderGeneration` writes overrides only on success). The replaced WAV is deleted.
- `POST /api/merge` on the engine joins clips in the order given with a silence gap, resamples to the first clip's rate, and writes 16-bit PCM (`merged_*.wav` in storage/audio, plus a copy named `<project> - <episode>.wav` in the chosen folder). It does not take the model lock. `mergeEpisode` refuses while any segment is unfinished.
- **Order is drag and drop** (`@dnd-kit`, in the episode page): a card's header is the handle, so the player and buttons keep their own gestures; the drop sends the whole new order to `reorderSegments(episodeId, ids)`, which refuses a list that is not exactly the episode's segments (a stale page) rather than half-applying it. Optimistic in `useReorderSegments`.
- **Audio no model rendered** can be a segment too: `Generation.source` is `tts` (default), `upload`, `recording` or `library`, with `modelId` `imported` and `text` as its label. «إضافة صوت» (`add-audio-dialog.tsx`) inserts one at any slot (`insertSegmentAt` in `src/lib/clips.ts` renumbers). Uploads/recordings are decoded to mono 24 kHz WAV in the browser (`processAudioFile` in `audio-encode.ts` — a recording is trimmed and peak-normalized, an upload kept as made) and posted to the Route Handler `POST /api/episodes/[id]/audio`, which stores them through the engine's `/api/import-audio`. Imported segments are never rendered: `renderSegment`/`retakeSegment`/`setSegmentVoice` refuse them, `applyVoiceToSegments` and the voice bar skip them, and `updateSegmentText` only renames them. The history (`getGenerations`, stats) lists `tts` rows only.
- **Clip library** (`/library`, `Clip` model, files in `storage/clips/`): saved audio to reuse — intros, sign-offs, the user's own recordings. `POST /api/clips` (upload/record), `src/actions/clips.ts` (list, rename, delete, `insertClipIntoEpisode`, `saveToLibrary` from any take). **Every insert is a file copy** (`copyStoredAudio`), so deleting or editing a segment never touches the saved clip and vice versa.
- `Episode.mergedSignature` records which takes, in which order, the merge was built from (`mergeSignature()` in `src/lib/projects.ts`). Any retake, move, add or delete changes it, and the page flags the merge as stale.
- Studio generations and project segments share one render path, `src/lib/render.ts` (`resolveVoiceReference`, `renderGeneration`).

## Dubbing (a new voice on a finished video)
- `Dub` holds the video (`videoPath` in `storage/videos/src_*`, a copy; `posterPath`; `duration`; `hasAudio`), the detected `language`, the voice it renders with (like an episode), `background` (original soundtrack kept under the new voice, 0–1) and the latest output (`outputVideoPath` `dubbed_*` in storage/videos, `outputAudioPath` `dub_*.wav`, `outputSavedPath`, `outputSignature`).
- Its lines are `Generation` rows with `dubId`, `position`, `startMs`/`endMs` (where the original line was spoken) and `sourceText` (what Whisper heard); `text` is what gets spoken. Studio (`studioOnly`) excludes them; the history lists them like episode segments.
- Flow: `POST /api/dubs` (Route Handler; the raw body is the file, streamed to disk — `formData()` would buffer a GB video; then engine `/api/dub/probe` for duration + poster) → `transcribeDub` (engine `/api/dub/transcribe`, replaces all lines, each PENDING with its own words) → optional `applyTranslation(texts)` (exact line count; `parseTranslation` in `src/lib/dubbing.ts` strips sequential "1." numbering) → `useDubRenderQueue` → `renderDubLine` → `assembleDub` (engine `/api/dub/assemble`, refuses unfinished lines).
- **Changing a line's text drops its take** (`setLineTexts`: audio deleted, back to PENDING) — unlike episodes, where a finished segment's text only changes through a retake. A dub line's text is usually replaced wholesale by a pasted translation, before anything renders.
- **Timing**: `renderDubLine` sends `targetDuration` (the line's slot) and `maxDuration` (room until the next line / video end, `lineTiming`) as `engineParams` — to the engine only, never stored in `Generation.params` (`renderGeneration`'s `engineParams` option). The card's fit badge (`fitState`) compares the take with the room: fits / will be sped up / will be cut.
- Deleting a dub deletes its lines, takes, source video, poster and outputs in storage/; never the exported copy. «فيديو عندك» starts a new dub from another dub's video (APFS clone copy, so deleting either is safe).
- **No translation model, on purpose** (user decision): the transcript is copied out one line per timed line and the translation pasted back.

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
  - `storage/clips/`: the clip library. `storage/videos/`: dub sources (`src_*` + a `.jpg` poster) and dubbed videos (`dubbed_*`). The audio route serves both with a content type by extension (it used to answer everything as `audio/wav`).
- These folders are gitignored (except `.gitkeep`).
