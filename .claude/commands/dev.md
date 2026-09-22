# Development Server Workflow

## Command
```bash
./scripts/dev.sh
```

## Description
Starts both development servers concurrently with automated cleanup on exit (Ctrl+C). There is no database process — Prisma opens `prisma/namaa.db` directly.

## Components Started
1. **FastAPI TTS Sidecar**:
   - Preflight: checks `venv/bin/uvicorn` is executable and `import silma_tts` succeeds, aborting with a pointer to `setup.sh` if not.
   - Runs `venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000`.
   - Warms the **default model (`silma`)** on startup via a background task; the other two load on first use.
2. **Next.js 15 Web Application**:
   - Runs `npm run dev` with Turbopack on port 3000.

## Why absolute venv paths
The script calls `venv/bin/python` and `venv/bin/uvicorn` directly instead of
sourcing `activate`. A stale `VIRTUAL_ENV` baked into `activate` (left behind by
renaming the venv directory) prepends a nonexistent path, a pyenv shim wins the
lookup, and the engine dies with `ModuleNotFoundError: No module named 'fastapi'`.

## Process Management
- A bash trap captures `SIGINT` / `SIGTERM` signals and terminates both background PIDs gracefully.

## Endpoints
- Web: http://localhost:3000
- Engine: http://localhost:8000 — Swagger at `/docs`
- `curl -s localhost:8000/api/models` shows the registry and which model is resident.
