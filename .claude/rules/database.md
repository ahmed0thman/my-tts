# Database & Prisma Rules

## SQLite (no database server)
- The board is single-user and local, so the database is a file: `prisma/namaa.db`, configured as `DATABASE_URL="file:./namaa.db"` (resolved relative to `prisma/`).
- It replaced a dockerised PostgreSQL 17. The point was not SQLite's footprint but Docker Desktop's: its VM held ~2GB that the 4B Higgs model needs. There is now no container, no port 5440, and no `docker-compose.yml`.
- The file is gitignored (`*.db`), so a clone starts empty and `npx prisma db push` recreates it.
- Back it up by copying the file; there is nothing else to dump.
- Prisma 6.19 supports both `enum` and `Json` on SQLite, so the schema needed no restructuring — only the datasource provider changed. `Json` is stored as TEXT and round-trips through the client.
- Concurrency is the one real limitation: SQLite takes a write lock per transaction. Fine for one person generating one clip at a time; if the board ever grows concurrent writers, that is the thing that breaks first.

## Prisma ORM
- Client version: Prisma v6.19+ (`@prisma/client` and `prisma`).
- Singleton client pattern located in `src/lib/prisma.ts` utilizing `globalThis` to prevent connection leaks during Next.js hot-reloading.
- After changing the schema, restart the **Next.js** process — a running dev server keeps the old generated client in memory and reports `Unknown argument` for freshly added fields. The Python engine does not need restarting.

## Schema Conventions
- Models:
  - `VoiceProfile`: Uploaded/recorded reference voice samples with metadata and default status. `referenceText` holds the transcription SILMA needs to clone; it defaults to `""` so the column could be added without dropping existing rows, and an empty value is treated as "needs filling in" by `createGeneration` — but only when the selected model declares `requiresReferenceText`.
  - `Generation`: Historical record of all speech generations with status enum (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
    - `modelId String @default("silma")` — which engine rendered the row; ids come from `tts-engine/model_registry.py`.
    - `params Json?` — the parameters actually used. **Parameter names differ per model, so they are stored as a blob. Never reintroduce per-model columns.**
    - `savedPath String?` — absolute path of the exported copy when a custom save folder was used.
    - `seed String?` — the engine's range (0..4294967295) overflows Int32 and Prisma's `BigInt` will not JSON-serialize through a Server Action.
    - `speed` / `cfgStrength` / `nfeStep` are **legacy SILMA columns**, kept only so pre-multi-model history keeps its detail. New rows leave them at their defaults and record everything in `params`.
    - `episodeId String?` / `position Int?` — set when the row is an episode segment. `position` is the running-order slot; a retake keeps it, moving rewrites all slots. Cascade-deleted with the episode.
  - `Project`: A container (channel, series, client) — `title`, `description`, `episodes`. No audio of its own.
  - `Episode`: One finished piece of audio in a project. `title`, `description`, `kind` (`episode` | `short` | `other`), the voice it renders with (`modelId`, `voiceProfileId`, `params`, `outputDir`, remembered on every add/retake), `gapMs`, and the latest merge (`mergedAudioPath`, `mergedSavedPath`, `mergedDuration`, `mergedAt`, `mergedSignature`).
  - Deleting a project cascades episodes → segments in the database; the actions delete the segment and merged files in storage/ explicitly (rows cascade, files do not), never an exported copy.
  - `Preset`: Saved parameter combinations, scoped to a model (`modelId`, `params`, `voiceProfileId`). Uniqueness is `@@unique([name, modelId])`, not a global unique on `name`: the same name ("سريع", "محايد") is a different combination per engine, and a global unique made saving the second model's copy fail with P2002. `createPreset` maps that code to an Arabic message rather than leaking the Prisma error. The same three legacy columns are retained for presets saved before multi-model support. The seed is deliberately not part of a preset since it is per-take.
- Indexes on `Generation`: `createdAt desc`, `voiceProfileId`, `status`.
- Modification workflow — **migrations, not `db push`**:
  1. Edit `prisma/schema.prisma`.
  2. Run `npx prisma migrate dev --name <change>`. This writes `prisma/migrations/<ts>_<change>/migration.sql`, applies it to the repo database and regenerates the client.
  3. Restart `next dev`.
- Why: the desktop app runs `prisma migrate deploy` on every launch against `~/Library/Application Support/Sawtak/sawtak.db`. A change made with `db push` has no migration file, so installed apps never receive it and break on the next query that uses it.
- `0_init` is the baseline (the schema as of Projects → Episodes). Databases created before it were marked applied with `prisma migrate resolve --applied 0_init`.
- The `prisma` CLI is a runtime dependency (not dev) because the packaged app runs it.
