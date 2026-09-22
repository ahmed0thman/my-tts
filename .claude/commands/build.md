# Production Build & Verification Workflow

## Commands

### Next.js Production Build
```bash
npm run build
```
Compiles and bundles the Next.js application for production. Verifies:
- TypeScript type integrity
- Static page generation for all dashboard routes
- API route bundling for `/api/audio/[...path]`

### TypeScript Static Type Check
```bash
npx tsc --noEmit
```
Performs a strict type check without generating output files. Must always complete with 0 errors.

### Python Engine Verification
```bash
tts-engine/venv/bin/python -m py_compile tts-engine/*.py tts-engine/engines/*.py
```
Validates Python syntax and AST compilation across the FastAPI sidecar and every
engine adapter. Use the venv's interpreter, not the system `python3` — the
sidecar targets 3.11.

### Import & Registry Smoke Test
```bash
tts-engine/venv/bin/python -c 'from silma_tts.api import SilmaTTS'
tts-engine/venv/bin/python -c 'from chatterbox.mtl_tts import ChatterboxMultilingualTTS'
curl -s localhost:8000/api/models
```
Syntax checks pass happily while a dependency is broken; these do not. The
`/api/models` call additionally confirms the registered models (this branch: `voicetut` only) are listed and
reports which one is currently resident.
