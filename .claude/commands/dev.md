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
   - Runs `venv/bin/uvicorn main:app --reload --uds storage/run/engine.sock` (reuses an engine already answering there; removes a stale socket file otherwise).
   - Warms the **default model (`voicetut`, ~4–7 s warm)** on startup via a background task. Note `uvicorn --reload` watches the engine directory, so editing an adapter restarts the process and drops the resident model.
2. **Next.js 15 Web Application**:
   - Runs `npm run dev -- --hostname 127.0.0.1 --port <first free from 43117>`.

## Why absolute venv paths
The script calls `venv/bin/python` and `venv/bin/uvicorn` directly instead of
sourcing `activate`. A stale `VIRTUAL_ENV` baked into `activate` (left behind by
renaming the venv directory) prepends a nonexistent path, a pyenv shim wins the
lookup, and the engine dies with `ModuleNotFoundError: No module named 'fastapi'`.

## Process Management
- A bash trap captures `SIGINT` / `SIGTERM` signals and terminates both background PIDs gracefully.

## Endpoints
- Web: the URL dev.sh prints (http://127.0.0.1:43117 unless taken)
- Engine: `unix:storage/run/engine.sock` — probe with `curl --unix-socket storage/run/engine.sock http://e/api/health`
- `curl -s --unix-socket storage/run/engine.sock http://e/api/models` shows the registry and which model is resident.
