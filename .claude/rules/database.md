# Database & Prisma Rules

## PostgreSQL 18 Infrastructure
- PostgreSQL runs via Docker Compose defined in `docker-compose.yml` (`image: postgres:18-alpine`).
- Connection string is configured via `.env` (`DATABASE_URL="postgresql://postgres:postgres@localhost:5440/namaa_tts"`).

## Prisma ORM
- Client version: Prisma v6.19+ (`@prisma/client` and `prisma`).
- Singleton client pattern located in `src/lib/prisma.ts` utilizing `globalThis` to prevent connection leaks during Next.js hot-reloading.

## Schema Conventions
- Models:
  - `VoiceProfile`: Uploaded/recorded reference voice samples with metadata and default status. `referenceText` holds the transcription SILMA needs to clone; it defaults to `""` so the column could be added without dropping existing rows, and an empty value is treated as "needs filling in" by `createGeneration`.
  - `Generation`: Historical record of all speech generations with status enum (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`). `seed` is a `String?` — the engine's range (0..4294967295) overflows Int32 and Prisma's `BigInt` will not JSON-serialize through a Server Action.
  - `Preset`: Saved parameter combinations (`speed`, `cfgStrength`, `nfeStep`, `voiceProfileId`).
- Modification workflow:
  1. Edit `prisma/schema.prisma`.
  2. Run `npx prisma db push` (for development synchronization) or `npx prisma migrate dev`.
  3. Run `npx prisma generate` to refresh the TypeScript client.
