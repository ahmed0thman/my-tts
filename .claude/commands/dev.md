# Development Server Workflow

## Command
```bash
./scripts/dev.sh
```

## Description
Starts all necessary development servers concurrently with automated cleanup on exit (Ctrl+C).

## Components Started
1. **PostgreSQL 18**: Ensures container is active via Docker Compose.
2. **FastAPI TTS Sidecar**:
   - Activates `tts-engine/venv`.
   - Runs `uvicorn main:app --reload --host 0.0.0.0 --port 8000`.
   - Loads the NAMAA model on startup in background task.
3. **Next.js 15 Web Application**:
   - Runs `npm run dev` with Turbopack on port 3000.

## Process Management
- A bash trap captures `SIGINT` / `SIGTERM` signals and terminates both background PIDs gracefully.
