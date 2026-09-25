# Database Operations Workflow

## Commands

### Schema Changes — always a migration
```bash
npx prisma migrate dev --name <change>
```
Writes a migration under `prisma/migrations/`, applies it to `prisma/namaa.db`, regenerates the client. Do **not** use `db push`: the installed desktop app upgrades its own database with `prisma migrate deploy` on launch, and a pushed change has no migration for it to apply.

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
and `npx prisma migrate deploy` to start clean. No server, no container, no port.
