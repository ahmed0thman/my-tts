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
python3 -m py_compile tts-engine/audio_utils.py tts-engine/model_manager.py tts-engine/main.py
```
Validates Python syntax and AST compilation across the FastAPI sidecar files.
