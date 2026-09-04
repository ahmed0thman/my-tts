# Database Operations Workflow

## Commands

### Schema Synchronization (Development)
```bash
npx prisma db push
```
Synchronizes changes in `prisma/schema.prisma` directly to the local PostgreSQL database without creating migration history files.

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

### Prisma Studio Visual Browser
```bash
npx prisma studio
```
Opens Prisma Studio on `http://localhost:5555` to browse and manage table records visually.

### PostgreSQL Container Inspection
```bash
docker compose ps
docker compose logs -f postgres
```
Checks container health and views active database transaction logs.
