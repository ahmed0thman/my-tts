# Project State & Technical Inventory

**Last Updated**: 2026-09-22
**Status**: Working on branch `voicetut` — VoiceTut generating and cloning; typecheck, Python compile and `bash -n` clean.

---

## 1. Executive Summary
A local text-to-speech and zero-shot voice-cloning control board for Arabic that
runs switchable models behind one interface. A Next.js 15 full-stack app talks
over HTTP to a Python FastAPI inference sidecar that loads exactly one model at
a time onto Apple Silicon MPS.

**This branch registers one model.** Five adapters exist; `MODEL_IDS` lists only
`voicetut`, because it is the only one that reproduces a speaker's voice
reliably and it is also the cheapest to run.

| id | Repo | Dialect | Runtime | Parameters | registered |
|---|---|---|---|---|---|
| `voicetut` (default) | `mohammedaly22/VoiceTut-TTS` | مصري + AR/EN | OmniVoice — Qwen3-0.6B + Higgs codec | `guidanceScale`, `speed`, `numStep` | **yes** |
| `silma` | `silma-ai/silma-tts` | فصحى / MSA | F5-TTS / DiT, 150M | `speed`, `cfgStrength`, `nfeStep` (+ `seed`) | no |
| `namaa-saudi` | `NAMAA-Space/NAMAA-Saudi-TTS` | سعودي / نجدي | Chatterbox fine-tune | `exaggeration`, `cfgWeight`, `temperature` | no |
| `namaa-egyptian` | `NAMAA-Space/NAMAA-Egyptian-TTS` | مصري | Chatterbox fine-tune | same three | no |
| `masri-higgs` | `ehabnegm/masri-higgs-v3-egyptian-tts` | مصري | Higgs Audio v3 — Qwen3-4B | `temperature`, `topK` | no |

Measured for `voicetut` on an M1 Pro, fp32 on MPS, 8.94 s reference: warm load
~4–7 s, RTF 1.76x, peak GPU 3.45 GB (2.34 GB weights + ~1.1 GB activations),
unload clean at 0 MB. Masri Higgs for comparison: 210 s load, RTF 7.29x, 8.7 GB.

The interface language is Egyptian Arabic throughout, regardless of which
dialect the selected model speaks.

---

## 2. Current Operational State

| Check | Command | Status |
| :--- | :--- | :--- |
| **Type Check** | `npx tsc --noEmit` | **PASS (0 errors)** |
| **Python Syntax** | `venv/bin/python -m py_compile tts-engine/*.py tts-engine/engines/*.py` | **PASS** |
| **Shell Scripts** | `bash -n scripts/setup.sh scripts/dev.sh` | **PASS** |
| **Prisma Client** | `npx prisma generate` | **PASS** — v6.19.3 |
| **Engine** | `GET /api/health` | **ok** — `device: mps`, `sample_rate: 24000` |
| **Registry** | `GET /api/models` | **1 model**, `default: voicetut` |
| **Node** | v24.16.0 / npm 11.13.0 | **PASS** |

### Measured behaviour
- Cold load: SILMA ~13 s · NAMAA ~37 s · NAMAA→NAMAA dialect swap ~19 s via `adopt()`.
- Resident memory holds at ~0.9 GB RSS across a full switch cycle — `unload()` works.
- Saudi vs Egyptian checkpoints: **291 of 292 tensors differ**; the dialect swap is real.
- Database holds 45 generations, 1 voice profile and 14 presets, all migrated from PostgreSQL into SQLite intact (`Json` and the status enum both round-trip).

---

## 3. Technology Stack & Versions (as installed)

- **Runtime**: Node.js v24.16.0 · Python **3.11.15** (`tts-engine/venv`, provisioned by `uv`)
- **Frontend**: Next.js 15.5.25 (App Router) · React 19.2.8 · TypeScript 5.9.3 (strict)
- **Styling**: Tailwind CSS v4.3.3 (CSS-first config) · Radix/Shadcn (19 UI components) · Hugeicons + Lucide
- **Data**: TanStack React Query 5.102.8 · React Hook Form 7.87.0 · Zod 3.25.76
- **Database**: **SQLite** at `prisma/namaa.db` · Prisma 6.19.3 (no server, no Docker)
- **ML**: torch **2.6.0** · torchaudio **2.6.0** · transformers **5.2.0** · numpy 1.26.4 · MPS backend
  - These are the versions `chatterbox-tts` hard-pins, and the only set where both runtimes coexist. 2.6 also stays below the torchaudio 2.9 cutover to `torchcodec` (which needs FFmpeg ≤ 7, while Homebrew ships 9).
- **Audio serving**: Next.js route handler with Range support and stream-cancel handling
- **Audio**: wavesurfer.js 7.12.11

> **Note**: docs previously claimed PostgreSQL 18 and torch 2.8. Both were wrong;
> the table above reflects what is actually installed and running.

---

## 4. File Inventory

### Configuration & Automation
- `package.json` — Node 24 engine lock; scripts for dev/build/lint and the Prisma helpers.
- `next.config.ts` — `experimental.serverActions.bodySizeLimit: '12mb'` (reference WAVs travel through a Server Action; the 1 MB default rejects ~20 s of 24 kHz mono).
- `docker-compose.yml` — **removed**. The Postgres container was replaced by a SQLite file; Docker Desktop's VM was holding ~2GB the 4B Higgs model needs.
- `.env` / `.env.example` — `DATABASE_URL`, `TTS_ENGINE_URL`, `NEXT_PUBLIC_TTS_ENGINE_URL`, storage paths.
- `scripts/setup.sh` — prerequisites (Node 24, uv, Homebrew), npm, Prisma (creates the SQLite file), Python 3.11 venv, the staged macOS install, **both** import verifications, storage dirs, weight warm-up with xet disabled.
- `scripts/dev.sh` — FastAPI (venv binaries by **absolute path**, with a `silma_tts` preflight) and Next.js; trap-based cleanup. No database process.

### Claude Agent Documentation
- `CLAUDE.md` — root briefing, incl. the multi-model architecture, the cloning contract, the macOS install rationale, and the known stale spots.
- `.claude/rules/architecture.md` — sidecar pattern, **model registry as the extension point**, route groups, Server Actions, storage isolation.
- `.claude/rules/frontend.md` — React/Tailwind/Query conventions, **schema-driven model parameters**, save location, voice recording.
- `.claude/rules/backend-ml.md` — environment pins, multi-model rules, the per-model contract table, MPS, API standards, output handling.
- `.claude/rules/database.md` — SQLite, Prisma singleton, schema conventions incl. the `params` blob rule.
- `.claude/rules/arabic-i18n.md` — Cairo, RTL, Egyptian vocabulary, model/dialect labels.
- `.claude/commands/{setup,dev,build,db}.md` — workflow guides.
- `.claude/settings.json` — permissions and environment (Node >= 24, Python 3.11, engine on a Unix socket, web on a free loopback port).

### Python TTS Sidecar (`tts-engine/`)
- `requirements.txt` — pins plus the full rationale for the three `--no-deps` installs and the `setuptools<81` pin.
- `main.py` — FastAPI app. Sets `HF_HUB_DISABLE_XET=1` **before** any HF import. Endpoints:
  - `POST /api/generate` — `text`, `model_id`, optional `voice_profile_path`, `reference_text`, `output_dir`, and `params` as a JSON string. Validates the model id, enforces `reference_text` only when the model declares `requiresReferenceText`, resolves the save folder before inference, normalizes the peak, writes the canonical copy to `storage/audio/` plus an optional export copy.
  - `GET /api/models` — every model's capabilities and parameter schema, plus `default` and `active`.
  - `POST /api/upload-reference` · `GET /api/voices` · `DELETE /api/voices/{filename}`
  - `GET /api/fs/browse` · `GET /api/fs/validate` — save-folder picker (directories only).
  - `GET /api/health` (adds `active_model`) · `GET /api/model-info`
  - Response headers: `X-Audio-Path`, `X-Saved-Path`, `X-Duration`, `X-Sample-Rate`, `X-Peak`, `X-Peak-Normalized`, `X-Seed`, `X-Model-Id`.
- `model_registry.py` — **the single place a model is registered**: `DEFAULT_MODEL_ID`, `MODEL_IDS`, the Chatterbox variant table, `is_valid()`, `create()`, `describe_all()`.
- `model_manager.py` — singleton owning the one resident engine. `ensure_loaded()` swaps under an `asyncio.Lock`, trying `ChatterboxEngine.adopt()` before falling back to unload+load; blocking work goes through `run_in_executor`.
- `engines/base.py` — the `TTSEngine` ABC (`load`, `generate`, `unload`, `describe`).
- `engines/silma_engine.py` — SILMA adapter. Packaged fallback reference + its transcription, `MAX_REFERENCE_SECONDS = 8.05`, echoes the seed back.
- `engines/chatterbox_engine.py` — serves **both** NAMAA dialects. Downloads only `t3_mtl23ls_v2.safetensors`; `_apply_t3()` clears the lazily-built `patched_model` before a strict `load_state_dict`; `adopt()` reuses a sibling's loaded base.
- `audio_utils.py` — filename generation, upload saving, `validate_audio_file` (3–30 s), `get_audio_duration`, `normalize_peak`, `resolve_output_dir`, `list_directories`, `build_shortcuts`.

### Next.js Application (`src/`)
- **Pages** — `(dashboard)/page.tsx` (studio), `voices/`, `history/`, `presets/`, `settings/`; `api/audio/[...path]/route.ts` (path normalization for three shapes, containment check → 403, Range → 206/416, stream `cancel()` destroying the Node handle).
- **Server Actions** — `generation.ts` (model-aware; checks `requiresReferenceText` before spending inference), `voice-profiles.ts` (incl. `updateVoiceProfile` for the transcription), `presets.ts` (model-scoped), `models.ts`, `filesystem.ts`.
- **Hooks** — `use-models.ts` (+`defaultParamsFor`), `use-generations.ts`, `use-voice-profiles.ts`, `use-presets.ts`, `use-engine-status.ts`, `use-directory-browser.ts`.
- **Generation components** — `param-sliders.tsx` (presentational, schema-driven), `model-selector.tsx` (localStorage `namaa:model-id`, capability badges, resets `params` on switch), `model-params.tsx` (one Slider per declared param), `voice-controls.tsx` (model selector + params + preset filtering + schema-driven save dialog), `output-path-picker.tsx` (localStorage `namaa:output-dir`), `text-input.tsx`, `generation-form.tsx`, `audio-player.tsx`, `master-audio-dock.tsx`.
- **Voice components** — `voice-recorder.tsx` (raw `getUserMedia`, teleprompter, duration bands), `upload-dialog.tsx` (record/upload tabs), `voice-card.tsx` (transcription dialog + `ناقص نص العينة` badge).
- **History** — `generation-list.tsx` (`MODEL_LABELS`, `PARAM_LABELS`, renders `params` with a legacy-column fallback).
- **Lib** — `tts-client.ts` (`TtsModel`, `ModelParamSpec`, `listModels()`), `tone-axes.ts` (semantic tone → per-model parameters), `validations.ts`, `audio-encode.ts`, `reference-script.ts`, `prisma.ts`, `utils.ts`.
- **Other** — `layout/` (app shell, sidebar, header, engine status), `studio/studio-telemetry.tsx`, `tour/onboarding-tour.tsx` (4 steps).

### Database (`prisma/schema.prisma`)
- **`VoiceProfile`** — `referenceAudioPath`, `referenceText` (default `""`), `duration`, `isDefault`.
- **`Generation`** — `text`, `audioPath`, `savedPath`, **`modelId`** (default `silma`), **`params Json?`**, `voiceProfileId`, `seed String?`, `duration`, `fileSize`, `status`, `error`; legacy `speed`/`cfgStrength`/`nfeStep` retained for pre-multi-model rows. Indexed on `createdAt desc`, `voiceProfileId`, `status`.
- **`Preset`** — `name` (unique), `description`, **`modelId`**, **`params Json?`**, `voiceProfileId`; same three legacy columns.

---

## 5. Storage
- `storage/audio/` — generated `gen_*.wav` (30 files). Always written here even when a custom save folder is used.
- `storage/voice-samples/` — uploaded/recorded `ref_*.wav` (1 file).
- Both tracked via `.gitkeep` and excluded from version control.
- Model weights live in `~/.cache/huggingface/hub`, not in the repo (~10 GB, plus 1.6 GB of Whisper if SILMA ever fell back to ASR).

---

## 6. Known Gaps & Loose Ends

**Reference-length mismatch (SILMA only):**
- The recorder targets 12–22 s and the read-aloud script is ~20 s, both tuned for the NAMAA models, which have no cap. SILMA truncates at 8.05 s and then discards `referenceText` in favour of Whisper large-v3-turbo.
- The one existing profile, `AR_M_Nassim` (18.23 s, transcription present), is over the cap: it works with the NAMAA models and triggers ASR on SILMA.
- A plan to fix this exists at `~/.claude/plans/what-it-is-downloading-lovely-squirrel.md` (shorter script, retuned recorder bands, `trim_reference_audio()`, a trim endpoint). **The user deferred it** — "I will come to it later."

**Housekeeping:**
- `tts-engine/venv-chatterbox-old/` (~1.3 GB) is still on disk, awaiting the go-ahead to delete.
- Whisper weights (~1.6 GB) remain cached; removable once no profile exceeds SILMA's cap.
- `main.py`'s FastAPI title is still `"NAMAA Egyptian TTS API"` from the single-model era.
- `setup.sh`'s step counters read `[1/7]`…`[5/7]` then `[6/8]`…`[8/8]` — cosmetic.
- One `Generation` row is stuck in `PROCESSING` (2026-09-04 01:46 UTC): the Next dev server was restarted mid-request while regenerating the Prisma client. Nothing reaps orphaned rows.

---

## 7. Recently Changed

**2026-09-22 — SQLite replaced PostgreSQL.** The datasource provider is the only
schema change: Prisma 6.19 supports `enum` and `Json` on SQLite, so `Generation`,
`Preset` and `VoiceProfile` are unchanged. `docker-compose.yml` is gone, `dev.sh`
and `setup.sh` no longer touch a database server, and `DATABASE_URL` is
`file:./namaa.db`. All 60 rows were exported and re-imported with timestamps
preserved. The motive was memory: Docker Desktop's VM, not Postgres itself.

**2026-09-22 — Fourth model: `masri-higgs` (Egyptian, 4B).** Measured on M1 Pro:
load 209s, peak RSS 8.74GB, **RTF 7.3x** (27s of compute per 3.7s of audio).
Two obstacles, both solved: its codec only exists in transformers >= 5.3 (vendored
into `engines/vendor/higgs_codec`, since chatterbox pins 5.2.0), and its serving
module hardcodes `sdpa`, which Metal cannot compile for Qwen3's GQA shapes —
forced to `eager` on MPS. Licence is non-commercial/creator with attribution.

## 8. Recently Fixed (2026-09-04)

- **Persona chips did nothing.** `text-input.tsx` still called `setValue` on the flat `speed`/`cfgStrength`/`nfeStep` fields that left `generateSchema` when parameters became per-model. Chips now carry a tone on shared axes and resolve it against the active model (`src/lib/tone-axes.ts`).
- **Standalone preset builder saved empty presets.** `presets/page.tsx` rendered SILMA-only sliders and posted flat fields that Zod stripped, producing `params: {}`. It is now model-aware: a model selector, schema-driven sliders via `ParamSliders`, suggestions computed from each model's own ranges, and saved presets rendered with their model badge and correct labels.
- **Preset names were globally unique**, so the same suggestion could only be saved for one model. Now `@@unique([name, modelId])`.
- **The remembered model was wiped on every reload.** Radix `Select` emits `onValueChange('')` while the item list is still loading; `ModelSelector` wrote that through to `localStorage`. It now ignores ids that match no model, and restores only once the registry has arrived (also seeding that model's default params).
- **English toasts** in `useDeletePreset` replaced with Arabic, matching the rest of the UI.
- `.claude/settings.json` now states Python **3.11** exactly, with the reason.
