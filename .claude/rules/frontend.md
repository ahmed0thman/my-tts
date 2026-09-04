# Frontend & UI Component Rules

## Technologies
- Next.js 15 (Turbopack in dev, optimized standalone in production).
- React 19.
- Tailwind CSS v4 (using `@import 'tailwindcss';` in `globals.css`, no `@tailwind` directives).
- Shadcn/ui built on top of Radix UI primitives.
- React Query (@tanstack/react-query v5).
- React Hook Form v7 with `@hookform/resolvers/zod`.

## Directives & Execution Boundaries
- Every component utilizing browser APIs, React state (`useState`, `useEffect`), or Radix UI primitives must start with `'use client';` on the first line.
- Server components should remain server-rendered unless client interactivity is required.

## Forms & Validation Rules
- All forms must validate inputs through Zod schemas defined in `src/lib/validations.ts`.
- Schema numeric fields should use `z.coerce.number()` to automatically parse string inputs from HTML form elements.
- Always provide sensible defaults for form values in `useForm({ defaultValues: ... })`.

## Query & Mutation Practices
- In `useMutation`, always invalidate related query keys in `onSuccess`:
  ```typescript
  queryClient.invalidateQueries({ queryKey: ['generations'] });
  ```
- Use `sonner` (`toast.success` and `toast.error`) for user feedback on mutations.
- Keep optimistic updates safe by snapshotting previous query data before mutating.

## Save Location
- The generation form exposes a save-folder picker (`src/components/generation/output-path-picker.tsx`) bound to the `outputDir` field of `generateSchema`.
- The chosen folder is remembered in `localStorage` under `namaa:output-dir`; every read/write is wrapped in try/catch because storage can be unavailable.
- Folder listings come from the engine through `src/actions/filesystem.ts`, so the engine URL stays server-side.

## Voice Recording
- The voices page records references in-browser (`src/components/voices/voice-recorder.tsx`) alongside the file-upload tab.
- MediaRecorder produces WebM/Opus or MP4, which the engine rejects, so `src/lib/audio-encode.ts` decodes and re-renders through an `OfflineAudioContext` to mono 24 kHz, trims edge silence, normalizes, and writes a 16-bit PCM WAV client-side. No server-side conversion, no extra dependency.
- `getUserMedia` requests raw audio (`echoCancellation`, `noiseSuppression`, `autoGainControl` all off) — browser voice processing degrades timbre the cloner depends on.
- The read-aloud script lives in `src/lib/reference-script.ts`; it is chosen for phonetic coverage and prosody range, not as filler text.
- Server Actions carry the WAV, so `serverActions.bodySizeLimit` in `next.config.ts` must stay above the largest reference (1 MB default rejects ~20s of 24 kHz mono).

## Generation Parameters
- The form binds SILMA's real knobs: `speed` (0.5–2.0), `cfgStrength` (1–4), `nfeStep` (8–32, step 4) and an optional `seed`. Chatterbox's `exaggeration`/`cfg` are gone from the schema, the DB and the UI.
- `Preset` stores the same three values; the seed is deliberately not part of a preset since it is per-take.
- Slider ranges must match `generateSchema` in `src/lib/validations.ts` and the engine's clamps — changing one without the others produces 422s from FastAPI.
