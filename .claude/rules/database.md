# Database & Prisma Rules

## PostgreSQL Infrastructure
- PostgreSQL runs via Docker Compose defined in `docker-compose.yml` (`image: postgres:17-alpine`), published on host port **5440** with a named volume `namaa_pgdata` and a `pg_isready` healthcheck.
- Connection string is configured via `.env` (`DATABASE_URL="postgresql://postgres:postgres@localhost:5440/namaa_tts"`).
- Bumping the image major version is not a one-line change: an existing `namaa_pgdata` volume will refuse to start under a newer server. Dump first, or recreate the volume.

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
  - `Preset`: Saved parameter combinations, scoped to a model (`modelId`, `params`, `voiceProfileId`). Uniqueness is `@@unique([name, modelId])`, not a global unique on `name`: the same name ("سريع", "محايد") is a different combination per engine, and a global unique made saving the second model's copy fail with P2002. `createPreset` maps that code to an Arabic message rather than leaking the Prisma error. The same three legacy columns are retained for presets saved before multi-model support. The seed is deliberately not part of a preset since it is per-take.
- Indexes on `Generation`: `createdAt desc`, `voiceProfileId`, `status`.
- Modification workflow:
  1. Edit `prisma/schema.prisma`.
  2. Run `npx prisma db push` (for development synchronization) or `npx prisma migrate dev`.
  3. Run `npx prisma generate` to refresh the TypeScript client.
  4. Restart `next dev`.
