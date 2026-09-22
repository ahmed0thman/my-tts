#!/bin/bash
set -e

# ============================================================
# NAMAA Egyptian TTS Control Board — Development Server
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Trap to clean up background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$TTS_PID" ]; then
        kill $TTS_PID 2>/dev/null
        echo -e "  ${GREEN}✓ TTS engine stopped${NC}"
    fi
    if [ ! -z "$NEXT_PID" ]; then
        kill $NEXT_PID 2>/dev/null
        echo -e "  ${GREEN}✓ Next.js stopped${NC}"
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   🎙️  SILMA Arabic TTS — Dev Server              ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# -----------------------------------------------------------
# 1. Start Python TTS Engine
# -----------------------------------------------------------
echo -e "\n${YELLOW}[1/2] Starting TTS Engine (FastAPI)...${NC}"

cd "$PROJECT_DIR/tts-engine"

if [ ! -d "venv" ]; then
    echo -e "  ${RED}❌ Python venv not found. Run ./scripts/setup.sh first.${NC}"
    exit 1
fi

# Call the venv's binaries by absolute path rather than relying on PATH after
# `activate` — a stale VIRTUAL_ENV or a pyenv shim silently resolves `uvicorn`
# to a different Python and the engine dies with ModuleNotFoundError.
VENV_PY="$PROJECT_DIR/tts-engine/venv/bin/python"
VENV_UVICORN="$PROJECT_DIR/tts-engine/venv/bin/uvicorn"

if [ ! -x "$VENV_UVICORN" ]; then
    echo -e "  ${RED}❌ $VENV_UVICORN not found. Run ./scripts/setup.sh first.${NC}"
    exit 1
fi

if ! "$VENV_PY" -c "import silma_tts" 2>/dev/null; then
    echo -e "  ${RED}❌ silma_tts is not importable in the venv. Run ./scripts/setup.sh.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Engine venv OK ($("$VENV_PY" --version))${NC}"

echo -e "  Starting FastAPI on port 8000..."
"$VENV_UVICORN" main:app --reload --host 0.0.0.0 --port 8000 &
TTS_PID=$!
echo -e "  ${GREEN}✓ TTS Engine starting (PID: $TTS_PID)${NC}"

# Wait a moment for the server to initialize
sleep 2

# -----------------------------------------------------------
# 2. Start Next.js Dev Server
# -----------------------------------------------------------
echo -e "\n${YELLOW}[2/2] Starting Next.js dev server...${NC}"

cd "$PROJECT_DIR"

npm run dev &
NEXT_PID=$!
echo -e "  ${GREEN}✓ Next.js starting (PID: $NEXT_PID)${NC}"

# -----------------------------------------------------------
# Ready!
# -----------------------------------------------------------
echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   🚀 All services running!                      ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║   Next.js:    http://localhost:3000               ║"
echo "║   TTS Engine: http://localhost:8000               ║"
echo "║   API Docs:   http://localhost:8000/docs          ║"
echo "║                                                  ║"
echo "║   Press Ctrl+C to stop all services              ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Wait for background processes
wait
