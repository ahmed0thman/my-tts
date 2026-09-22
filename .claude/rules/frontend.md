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
- `src/components/generation/model-selector.tsx` binds the `modelId` field, remembers the choice in `localStorage` under `namaa:model-id`, and shows the model's dialect plus its capability badges (`محتاج نص العينة`, `العينة ≤ 10s`) and repo. The restore effect checks a saved id against the models that actually exist, so unregistering a model does not leave a dead selection.
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
- Current bands: `MIN_DURATION = 3`, `MAX_DURATION = 10`, recorder sweet spot `IDEAL_MIN = 5` / `IDEAL_MAX = 9`, script `≈ ٧ ثواني`. **These are VoiceTut's window, and the hard stop is a correctness boundary, not a quality preference.** They were 3/30/12–22/≈20s, tuned for the NAMAA models which have no cap — and that is what produced the over-long references in the database. An over-cap clip does not merely clone less well on VoiceTut: the model recites the reference and drops the head of the requested text (measured: a 16.2s reference lost the prompt's first sentence in both of two takes; the same voice at 8.9s was verbatim).
- The cap is never hardcoded in a component. It is the shortest `maxReferenceSeconds` among the models `useModels()` returns, so re-registering a model with a different window moves it everywhere. `voice-card.tsx` renders an `أطول من N ثواني` badge for stored profiles that exceed it, and `createGeneration` refuses them with the measured duration before a PENDING row is written.
- `VoiceProfile.referenceText` is optional in `voiceProfileSchema` and enforced per-model at generation time; `voice-card.tsx` shows a `ناقص نص العينة` badge and an edit dialog for profiles missing it.
- Server Actions carry the WAV, so `serverActions.bodySizeLimit` in `next.config.ts` must stay above the largest reference (currently `12mb`; the 1 MB default rejects ~20s of 24 kHz mono).

## Tone Axes
- `src/lib/tone-axes.ts` translates a semantic tone (`pace`, `expressiveness`, `fidelity`, each 0–1) into concrete parameters for whichever model is selected. The mapping is keyed by **parameter key**, never by model id.
- Interpolation is anchored on each parameter's declared `default`, so 0.5 reproduces the model's own neutral instead of the midpoint of its range.
- Values are snapped to the parameter's own `step` and rounded, because float accumulation over a 0.05 step (1.3500000000000003) drifts off the slider's ticks.
- Used by the studio's persona chips (`text-input.tsx`) and the presets page's suggestions. `modelSupportsTone()` hides a suggestion the active model cannot express, rather than rendering one that would do nothing.
- Adding a knob to an engine means adding one line to `PARAM_AXES` if it should respond to tones; leaving it out is safe — it just keeps its default.

## Model-id constants
- `src/lib/models.ts` holds two ids that used to both be spelled `'silma'` inline in 12 places:
  - `DEFAULT_MODEL_ID` — what to select when the user has not chosen and `useModels()` has not resolved. Form defaults, the selector, `createGeneration`, `createPreset`, `tts-client`.
  - `LEGACY_MODEL_ID` — what a `Generation`/`Preset` row with no `modelId` was rendered by, back before the column existed. **Historical; never change it.**
- They are equal only by accident and move independently: unregistering a model changes the first, and touching the second would relabel existing history. Prefer `useModels().data.default` — the engine is the real source of truth.

## Progress & Long Requests
- `GET /api/progress` (engine) → `src/app/api/progress/route.ts` (proxy) → `useEngineProgress()` → `generation-progress.tsx`, polled once a second while a generation is pending.
- **The proxy is a Route Handler, not a Server Action, and must stay one.** Next.js runs Server Actions serially per client, so a poll written as an action queues behind the generation it reports on and updates only after it finishes. This was observed: the panel froze at a stale snapshot for the whole run.
- The studio previously showed four invented "stages" on a 1.2s timer. That is gone — with a model running ~7x slower than realtime, fake progress actively misleads.
- `percent` is null unless the job has more than one sentence; a single opaque call shows an indeterminate bar rather than sitting at 0%.
- A failed poll is deliberately quiet (`retry: false`, a small inline note). The generation is unaffected by the poll failing.

## Component Split
- `param-sliders.tsx` is presentational: `{ model, values, onChange }`. Both the studio (react-hook-form) and the presets page (local state) render through it.
- `model-params.tsx` is the thin form-context wrapper around it.
- Do not duplicate slider markup anywhere else; the schema is the only source of what to render.
