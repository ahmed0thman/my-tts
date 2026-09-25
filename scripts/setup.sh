#!/bin/bash
set -e

# ============================================================
# NAMAA Egyptian TTS Control Board — First-Time Setup
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   🎙️  SILMA Arabic TTS — Setup Script            ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# -----------------------------------------------------------
# 1. Check Prerequisites
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 24+ (current LTS) from https://nodejs.org${NC}"
    exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
    echo -e "${RED}❌ Node.js version 24+ (LTS) required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install Node.js/npm from https://nodejs.org${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Package manager: npm ($(npm -v))${NC}"

# Check uv — used to provision Python 3.11 for the TTS engine.
# 3.11 is not optional: silma-tts pins numpy<=1.26.4, which has no wheels for
# 3.12/3.13 and will not build there.
if ! command -v uv &> /dev/null; then
    echo -e "${RED}❌ uv is not installed. Install it with:${NC}"
    echo -e "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
echo -e "  ${GREEN}✓ uv $(uv --version | awk '{print $2}')${NC}"

# No database server to check: Prisma talks to a local SQLite file.

# Check Homebrew — needed for openfst (pynini builds against it) and ffmpeg
if ! command -v brew &> /dev/null; then
    echo -e "${RED}❌ Homebrew is not installed. See https://brew.sh${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Homebrew found${NC}"

# -----------------------------------------------------------
# 2. Environment File
# -----------------------------------------------------------
echo -e "\n${YELLOW}[2/6] Setting up environment...${NC}"
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "  ${GREEN}✓ Created .env from .env.example${NC}"
    else
        echo -e "  ${RED}❌ No .env.example found${NC}"
        exit 1
    fi
else
    echo -e "  ${GREEN}✓ .env already exists${NC}"
fi

# -----------------------------------------------------------
# 3. Install Node Dependencies
# -----------------------------------------------------------
echo -e "\n${YELLOW}[3/6] Installing Node.js dependencies...${NC}"
cd "$PROJECT_DIR"

npm install
echo -e "  ${GREEN}✓ Node dependencies installed${NC}"

# -----------------------------------------------------------
# 4. Setup Prisma
# -----------------------------------------------------------
echo -e "\n${YELLOW}[4/6] Setting up database schema...${NC}"
cd "$PROJECT_DIR"

npx prisma generate
# Migrations, not `db push`: the desktop app upgrades its database with the same
# migration files. A database created by `db push` before migrations existed
# already has the 0_init schema, so it is marked applied rather than rebuilt.
npx prisma migrate deploy || { npx prisma migrate resolve --applied 0_init && npx prisma migrate deploy; }
echo -e "  ${GREEN}✓ SQLite database ready at prisma/namaa.db${NC}"

# -----------------------------------------------------------
# 5. Python TTS Engine
# -----------------------------------------------------------
echo -e "\n${YELLOW}[5/7] Setting up Python TTS engine...${NC}"

# --- 6a. Native libraries -----------------------------------
# openfst: pynini compiles against it. ffmpeg: audio decoding for librosa/pydub.
echo -e "  Checking native libraries (openfst, ffmpeg)..."
brew list openfst &>/dev/null || brew install openfst
brew list ffmpeg &>/dev/null || brew install ffmpeg
echo -e "  ${GREEN}✓ openfst + ffmpeg present${NC}"

cd "$PROJECT_DIR/tts-engine"

# --- 6b. Python 3.11 venv -----------------------------------
if [ ! -d "venv" ]; then
    echo -e "  Creating Python 3.11 virtual environment..."
    uv venv --python 3.11 venv
fi
PY_BIN="$PROJECT_DIR/tts-engine/venv/bin/python"
echo -e "  ${GREEN}✓ $($PY_BIN --version)${NC}"

# --- 6c. Resolvable dependencies ----------------------------
echo -e "  Installing Python dependencies (several minutes, ~3GB)..."
uv pip install --python "$PY_BIN" -r requirements.txt

# --- 6d. The three packages pip cannot resolve on macOS ------
# See the header of requirements.txt for why each needs --no-deps.
echo -e "  Building pynini against openfst (compiles C++, ~2 min)..."
CPPFLAGS="-I$(brew --prefix)/include" LDFLAGS="-L$(brew --prefix)/lib" \
    uv pip install --python "$PY_BIN" "pynini==2.1.7"

echo -e "  Installing SILMA and its Linux-pinned dependencies..."
uv pip install --python "$PY_BIN" --no-deps \
    catt_tashkeel==1.0.2 \
    nemo_text_processing==1.1.0 \
    silma-tts==1.0.5

echo -e "  Installing VoiceTut and its OmniVoice backbone..."
# OmniVoice asks for transformers>=5.3.0 for a single class,
# HiggsAudioV2TokenizerModel, which is vendored at
# tts-engine/engines/vendor/higgs_codec and shimmed in by the adapter. Every
# other symbol it imports exists in 5.2.0, so --no-deps keeps our pins.
# accelerate is required because VoiceTut loads with device_map=.
uv pip install --python "$PY_BIN" --no-deps \
    "git+https://github.com/k2-fsa/OmniVoice.git" \
    voicetut-tts \
    accelerate

echo -e "  ${GREEN}✓ Python dependencies installed${NC}"

# --- 6e. Verify the import chain ----------------------------
echo -e "  Verifying engine imports..."
if "$PY_BIN" -c "from silma_tts.api import SilmaTTS" 2>/dev/null; then
    echo -e "  ${GREEN}✓ SILMA imports cleanly${NC}"
else
    echo -e "  ${RED}❌ SILMA failed to import. Run this to see why:${NC}"
    echo -e "     tts-engine/venv/bin/python -c 'from silma_tts.api import SilmaTTS'"
    exit 1
fi

if "$PY_BIN" -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS" 2>/dev/null; then
    echo -e "  ${GREEN}✓ Chatterbox imports cleanly${NC}"
else
    echo -e "  ${RED}❌ Chatterbox failed to import. Run this to see why:${NC}"
    echo -e "     tts-engine/venv/bin/python -c 'from chatterbox.mtl_tts import ChatterboxMultilingualTTS'"
    exit 1
fi

# -----------------------------------------------------------
# 6. Create Storage Directories
# -----------------------------------------------------------
echo -e "\n${YELLOW}[6/7] Creating storage directories...${NC}"
cd "$PROJECT_DIR"

mkdir -p storage/audio
mkdir -p storage/voice-samples
echo -e "  ${GREEN}✓ Storage directories ready${NC}"

# -----------------------------------------------------------
# 7. Pre-download Model Weights
# -----------------------------------------------------------
echo -e "\n${YELLOW}[7/7] Pre-downloading model weights...${NC}"
echo -e "  ~10GB total: SILMA (2.6GB) + Chatterbox base (3GB) + two NAMAA"
echo -e "  dialect checkpoints (2.1GB each). Doing it now means the first"
echo -e "  generation is not a long wait."

cd "$PROJECT_DIR/tts-engine"
"$PROJECT_DIR/tts-engine/venv/bin/python" - <<'WARMUP'
import os
# HuggingFace's xet transfer stalls indefinitely on some repos.
os.environ["HF_HUB_DISABLE_XET"] = "1"

from huggingface_hub import snapshot_download
from silma_tts.api import SilmaTTS

# Constructing SILMA downloads its checkpoint, the vocos vocoder, the CATT
# tashkeel weights, and builds the NeMo normalizer grammars.
SilmaTTS(device="cpu", enable_normalizer=True, force_tashkeel=True)
print("SILMA cached.")

# The NAMAA dialect models only ship the fine-tuned t3; the rest comes from
# the shared Chatterbox base, which chatterbox-tts fetches on first load.
for repo in ("NAMAA-Space/NAMAA-Saudi-TTS", "NAMAA-Space/NAMAA-Egyptian-TTS"):
    snapshot_download(repo_id=repo, allow_patterns=["t3_mtl23ls_v2.safetensors"])
    print(f"{repo} cached.")
WARMUP

echo -e "  ${GREEN}✓ Model weights cached${NC}"

# -----------------------------------------------------------
# Done!
# -----------------------------------------------------------
echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅  Setup Complete!                            ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║   Run the development servers:                   ║"
echo "║   ./scripts/dev.sh                               ║"
echo "║                                                  ║"
echo "║   Or manually:                                   ║"
echo "║   1. cd tts-engine && venv/bin/python main.py    ║"
echo "║      (listens on storage/run/engine.sock)        ║"
echo "║   2. npm run dev  (in another terminal)          ║"
echo "║                                                  ║"
echo "║   dev.sh prints the web URL it picked            ║"
echo "║                                                  ║"
echo "║   Model weights are already cached               ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
