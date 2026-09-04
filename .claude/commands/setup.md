# Setup Command Workflow

## Command
```bash
./scripts/setup.sh
```

## Description
Executes the automated first-time setup sequence for the entire project. It is
idempotent — safe to re-run after a failed step.

## Steps Executed
1. **Prerequisite Verification**: Node.js **>= 24** (hard fail below), npm, **uv** (provisions Python 3.11), **Homebrew** (for `openfst` + `ffmpeg`), and Docker (soft — warns and skips the container if absent).
2. **Environment Initialization**: Copies `.env.example` to `.env` if `.env` does not already exist.
3. **Database Spin-up**: Launches the PostgreSQL 17 Alpine container on port **5440** and polls `pg_isready` for up to 30s.
4. **Node Dependency Installation**: Runs `npm install`.
5. **Database Schema**: Executes `npx prisma generate` and `npx prisma db push`.
6. **Python TTS Engine**:
   - `brew install openfst ffmpeg` if missing.
   - `uv venv --python 3.11 venv` in `tts-engine/`.
   - `uv pip install -r requirements.txt` (~3GB).
   - Builds `pynini==2.1.7` against Homebrew's OpenFst (`CPPFLAGS`/`LDFLAGS`, compiles C++, ~2 min).
   - Installs `catt_tashkeel`, `nemo_text_processing` and `silma-tts` with **`--no-deps`** — see the header of `tts-engine/requirements.txt` for why each one cannot be resolved by pip on macOS.
   - Verifies **both** import chains: `silma_tts.api.SilmaTTS` and `chatterbox.mtl_tts.ChatterboxMultilingualTTS`. Either failing aborts setup with the exact command to reproduce it.
7. **Storage Directory Creation**: Prepares `storage/audio/` and `storage/voice-samples/`.
8. **Model Weight Warm-up** (~10GB, with `HF_HUB_DISABLE_XET=1`):
   - Constructing `SilmaTTS` caches its checkpoint, the vocos vocoder, the CATT tashkeel weights, and builds the NeMo grammars (~2.6GB).
   - `snapshot_download` for both NAMAA dialect `t3_mtl23ls_v2.safetensors` files (~2.1GB each).
   - The shared Chatterbox base (~3GB) is fetched by `chatterbox-tts` on its first load.

## Notes
- The console step counters read `[1/7]`…`[5/7]` then `[6/8]`…`[8/8]`; cosmetic only, the sequence runs in full.
- Weights land in `~/.cache/huggingface/hub`, not in the repo, so deleting `tts-engine/venv` does not force a re-download.
