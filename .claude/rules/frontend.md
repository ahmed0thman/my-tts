# Frontend & UI Component Rules

## Technologies
- Next.js 15 (Turbopack in dev, optimized standalone in production).
- React 19.
- Tailwind CSS v4 (using `@import 'tailwindcss';` in `globals.css`, no `@tailwind` directives).
- Shadcn/ui built on top of Radix UI primitives (19 components in `src/components/ui/`).
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

## Model Selection & Parameters (schema-driven)
- The engine is the source of truth for what knobs exist. `GET /api/models` → `src/actions/models.ts` → `useModels()` (`src/hooks/use-models.ts`, `staleTime` 5 min since the registry is static for the life of the engine process).
- `src/components/generation/model-selector.tsx` binds the `modelId` field, remembers the choice in `localStorage` under `namaa:model-id`, and shows the model's dialect plus its capability badges (`محتاج نص العينة`, `العينة ≤ 8.05s`) and repo.
- `src/components/generation/model-params.tsx` renders **one Slider per entry in the active model's `params` array** — `{key, label, min, max, step, default, format?, integer?}`. Never hardcode a slider for a specific model here.
- Parameter names do not transfer between models, so changing the model resets `params` to `defaultParamsFor(next)` rather than carrying stale keys across.
- `generateSchema` therefore validates `params` as `z.record(z.string(), z.coerce.number())`; ranges are enforced by the engine, not duplicated in Zod. Adding a knob to an engine's `describe()` is the whole change.
- Presets are **model-scoped**: `Preset.modelId` + `Preset.params`. `voice-controls.tsx` filters the preset dropdown to the active model, and the save dialog summarises values from the active model's declared schema.
- History renders whatever `Generation.params` recorded, falling back to the legacy `speed`/`cfgStrength` columns for rows written before multi-model support (`generation-list.tsx`, `PARAM_LABELS`).

## Save Location
- The generation form exposes a save-folder picker (`src/components/generation/output-path-picker.tsx`) bound to the `outputDir` field of `generateSchema`.
- The chosen folder is remembered in `localStorage` under `namaa:output-dir`; every read/write is wrapped in try/catch because storage can be unavailable.
- Folder listings come from the engine through `src/actions/filesystem.ts`, so the engine URL stays server-side.

## Voice Recording
- The voices page records references in-browser (`src/components/voices/voice-recorder.tsx`) alongside the file-upload tab.
- MediaRecorder produces WebM/Opus or MP4, which the engine rejects, so `src/lib/audio-encode.ts` decodes and re-renders through an `OfflineAudioContext` to mono 24 kHz, trims edge silence, normalizes, and writes a 16-bit PCM WAV client-side. No server-side conversion, no extra dependency.
- `getUserMedia` requests raw audio (`echoCancellation`, `noiseSuppression`, `autoGainControl` all off) — browser voice processing degrades timbre the cloner depends on.
- The read-aloud script lives in `src/lib/reference-script.ts`; it is chosen for phonetic coverage and prosody range, not as filler text.
- Current bands: `MIN_DURATION = 3`, `MAX_DURATION = 30`, recorder sweet spot `IDEAL_MIN = 12` / `IDEAL_MAX = 22`, script `≈ 20 ثانية`. **These were tuned for the NAMAA models, which have no reference cap.** They exceed SILMA's 8.05s cap, so a reference recorded here works with NAMAA but makes SILMA clip the clip, discard `referenceText`, and fall back to Whisper.
- `VoiceProfile.referenceText` is optional in `voiceProfileSchema` and enforced per-model at generation time; `voice-card.tsx` shows a `ناقص نص العينة` badge and an edit dialog for profiles missing it.
- Server Actions carry the WAV, so `serverActions.bodySizeLimit` in `next.config.ts` must stay above the largest reference (currently `12mb`; the 1 MB default rejects ~20s of 24 kHz mono).

## Tone Axes
- `src/lib/tone-axes.ts` translates a semantic tone (`pace`, `expressiveness`, `fidelity`, each 0–1) into concrete parameters for whichever model is selected. The mapping is keyed by **parameter key**, never by model id.
- Interpolation is anchored on each parameter's declared `default`, so 0.5 reproduces the model's own neutral instead of the midpoint of its range.
- Values are snapped to the parameter's own `step` and rounded, because float accumulation over a 0.05 step (1.3500000000000003) drifts off the slider's ticks.
- Used by the studio's persona chips (`text-input.tsx`) and the presets page's suggestions. `modelSupportsTone()` hides a suggestion the active model cannot express, rather than rendering one that would do nothing.
- Adding a knob to an engine means adding one line to `PARAM_AXES` if it should respond to tones; leaving it out is safe — it just keeps its default.

## Component Split
- `param-sliders.tsx` is presentational: `{ model, values, onChange }`. Both the studio (react-hook-form) and the presets page (local state) render through it.
- `model-params.tsx` is the thin form-context wrapper around it.
- Do not duplicate slider markup anywhere else; the schema is the only source of what to render.
