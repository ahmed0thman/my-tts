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

## Confirmations
- **Never call `window.confirm` / `alert` / `prompt`.** Use `useConfirm()` from `src/providers/confirm-provider.tsx` (mounted once in `layout.tsx`): `if (!(await confirm({ title, description?, confirmLabel?, destructive? }))) return;`. Deletes and anything that discards work pass `destructive: true`.
- Inside the AudioMass iframe, `sawtak-bridge.js` replaces `window.alert` with a `sawtak:notice` message that the host shows as a toast.
- The one native prompt left is `beforeunload` on the editor page (reload / closing the tab with unsaved edits) — browsers do not allow styling it. In Electron, `electron/main.js` answers `will-prevent-unload` with a native sheet; without it the window silently refuses to close.

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
- «مجلد جديد» in the picker creates a folder inside the one being shown (`makeDirectory` → engine `POST /api/fs/mkdir`) and opens it. Its inline `<form>` stops submit propagation: React bubbles submit through the dialog portal to the studio's own form, which would start a generation.

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

## Projects
- `/projects` lists projects; `/projects/[id]` lists a project's episodes (cards with a player for merged ones); `/projects/[id]/episodes/[episodeId]` is the workspace. Components live in `src/components/projects/` (`project-dialog`, `episode-dialog`, `script-composer`, `segment-card`, `merge-panel`); data in `src/hooks/use-projects.ts` and `src/hooks/use-episodes.ts`.
- The episode workspace is one react-hook-form over the render settings (`modelId`, `params`, `voiceProfileId`, `outputDir`) and reuses `VoiceControls` with `showOutputPath={false}` — the folder picker lives in the merge panel, because in a project it receives the episode, not each clip.
- The sidebar voice in the episode workspace is the voice for *new* segments. Each `SegmentCard` shows its own voice as a chip that opens `segment-voice-dialog.tsx` (voices past the model's `maxReferenceSeconds` are disabled there). When some segments differ from the sidebar voice, a bar above the list offers to apply it to all of them.
- `restoreSaved` on `VoiceControls` / `ModelSelector` / `OutputPathPicker` is off for an episode that has a voice of its own: its saved voice must win over the studio's last-used model in localStorage, and changing it must not move the studio's.
- `useRenderQueue` renders sequentially and stops *between* segments; leaving the page stops it the same way. A row still PROCESSING that this page is not rendering is a leftover from a quit app and is shown as pending.
- Studio batch mode stays, and points long pieces at Projects.

## Audio Editor (vendored AudioMass)
- `public/audio-editor/` is AudioMass pinned to one commit; `SAWTAK.md` there lists every change. Keep patches to that list — the bridge (`sawtak-bridge.js`) and theme (`sawtak-theme.css`) are ours, everything else is upstream.
- The host talks to it only through postMessage (`sawtak:load` / `sawtak:export` / `sawtak:theme` in, `sawtak:ready` / `loaded` / `dirty` / `exported` / `error` out). Do not reach into the iframe's globals from React.
- Theme: the host sends its computed CSS tokens; the bridge maps them onto AudioMass's `--bg-*`, `--fg-*`, `--ac*` variables and recolors the canvases. Theme switches are followed with a MutationObserver on `<html class>` — next-themes' state changes before the class does, so tokens read on it are stale.
- The editor is LTR inside the RTL page. Its UI stays English.
- Entry points: "تعديل الصوت" on a segment with audio, "تعديل في المحرر" under a merged file.
- «تحسين احترافي» (`src/components/editor/enhance-dialog.tsx`) runs `public/audio-editor/sawtak-voice.js` through the bridge (`sawtak:enhance` → `sawtak:enhanced`) over the whole file as **one undo step**; it does not save — the user listens, then saves or undoes. Two tone presets (`deep`, `clear`), a switch per step, and a threshold slider for the gate (read the number off the waveform's dB axis).
- Volume / speed on a selection: `src/components/editor/selection-tools.tsx` above the editor → `applyEdit` → bridge `sawtak:edit` → `gainEdit` / `stretch` in `sawtak-voice.js`, spliced into the buffer as one undo step with the edited range left selected. Nothing selected = the whole file. The bridge reports the selection (`sawtak:selection`, with its peak) on AudioMass's `DidCreateRegion` / `DidDestroyRegion`. Speed is **WSOLA** (30 ms frames, ±10 ms waveform-aligned search) and keeps pitch — measured 112.7 → 114.3 Hz at 0.75× / 1.25× / 1.5× on a real take; AudioMass's own tempo is plain overlap-add and sounds phasey on speech, so it is not used. A stretched selection starts and ends on the original boundary samples (flat outer half-windows), so joins do not click. A boost past the selection's headroom is allowed; saving then scales the whole file down (`normalize_peak`), and the panel says so.
- The editor's waveform has a dBFS axis (`public/audio-editor/sawtak-db-axis.js`) and draws on a dB scale by default, because on a linear waveform everything under about −30 dB (breaths, word tails) is a flat line. The gate measures what that axis reads: the **peak** of each 10 ms frame (30 ms window), on the audio **as loaded**, as the first step of the chain. So a wave whose top reaches −45 on the axis is erased at a −40 threshold. Do not move the gate after loudness/compression again — the number would stop matching the axis.
- Protected from the gate, because cutting them is what clips letters: voiced frames, gaps under 300 ms inside a phrase, 100 ms after / 50 ms before a word. Measured safe (consonant level vs vowels within ~1 dB) down to a −30 threshold; at −25 consonants drop ~5 dB. Breath detection above the threshold (`removeBreaths`) is opt-in: ح / ه are acoustically breaths, and the user reported cut letters with it on.
- Level choices, from user feedback that −16 LUFS / 3:1 / 5 ms attack felt too loud and clipped word starts: −19 LUFS (the mono norm), 2.5:1 with a 10 ms attack, −1.5 dBFS ceiling, +2.5 dB at 110 Hz. Tune in Node against real takes (`speechMap` is exported; the chain has no DOM dependency), measuring consonant-vs-vowel level, not by ear alone.

## Dubbing
- `/dubbing` (list, `NewDubDialog`: upload with XHR progress, or «فيديو عندك» to reuse another dub's video) and `/dubbing/[id]` (a WorkspaceSplit workspace). Components in `src/components/dubbing/`: `dub-video` (original / dubbed toggle; line cards seek the original through its imperative handle), `transcript-panel` (transcribe, copy, paste translation with a live `n / N` line count, restore original), `dub-output-panel` (background level, export folder, assemble), `dub-line-card` (time range, spoken text, the original under it when translated, fit badge, player). Data: `src/hooks/use-dubs.ts`, `src/actions/dubs.ts`, pure helpers `src/lib/dubbing.ts`.
- Retakes and «ولّد الكل» use the right panel's model, knobs **and voice** (a dub is one voice; unlike episode segments there is no per-line voice).

## Workspace Layout (studio, episode and dub)
- `src/components/layout/workspace-split.tsx`: input and settings in a fixed **430 px** panel on the right, the generated clips as a card grid (`ClipGrid`) on the left. On `lg`+ the page fills the window (`isWorkspaceRoute()` in `src/lib/layout.ts` stops AppShell's `<main>` from scrolling and widens the shell to `.workspace-shell`) and each side scrolls on its own, so the settings stay in view while scrolling the cards. Below `lg` they stack.
- The grid's columns follow its own pane (container queries `@min-[34rem]` / `@min-[52rem]`): 1 → 2 → **3 at most** — the user found four too cramped to read.
- Cards: `segment-card.tsx` (episode) and `clip-card.tsx` (studio, `studioOnly` generations). The studio's newest take is marked «جديد» and auto-plays; `PendingClipCard` stands in while it renders (the list cannot refetch mid-generation, since Server Actions are serialized). This replaced the studio's listening dock.

## Component Split
- `param-sliders.tsx` is presentational: `{ model, values, onChange }`. Both the studio (react-hook-form) and the presets page (local state) render through it.
- `model-params.tsx` is the thin form-context wrapper around it.
- Do not duplicate slider markup anywhere else; the schema is the only source of what to render.
