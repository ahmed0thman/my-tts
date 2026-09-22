# Database Operations Workflow

## Commands

### Schema Synchronization (Development)
```bash
npx prisma db push
```
Synchronizes changes in `prisma/schema.prisma` directly to the local SQLite file without creating migration history files.

### Schema Migration (Production)
```bash
npx prisma migrate dev --name <migration_name>
```
Generates and runs SQL migration files in `prisma/migrations/`.

### Client Generation
```bash
npx prisma generate
```
Rebuilds the `@prisma/client` TypeScript definitions based on the current `schema.prisma`.

**Restart `next dev` afterwards.** A running dev server holds the previously
generated client in memory and rejects freshly added fields with
`Unknown argument <field>`. The Python engine is unaffected and can stay up.

### Prisma Studio Visual Browser
```bash
npx prisma studio
```
Opens Prisma Studio on `http://localhost:5555` to browse and manage table records visually.

### Inspecting the database file
```bash
sqlite3 prisma/namaa.db ".tables"
sqlite3 prisma/namaa.db "select modelId, count(*) from Generation group by 1;"
```
The whole database is `prisma/namaa.db`. Copy that file to back it up; delete it
and `npx prisma db push` to start clean. No server, no container, no port.
