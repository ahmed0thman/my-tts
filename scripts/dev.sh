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

# The engine listens on a Unix domain socket, not a TCP port — 8000 collided
# with other projects, and a socket file cannot. Same default as
# tts-engine/main.py, electron/processes.js and src/lib/tts-client.ts.
export SAWTAK_ENGINE_SOCKET="${SAWTAK_ENGINE_SOCKET:-$PROJECT_DIR/storage/run/engine.sock}"
if [ "${#SAWTAK_ENGINE_SOCKET}" -gt 103 ]; then
    echo -e "  ${RED}❌ Socket path is longer than macOS allows (103 bytes):${NC}"
    echo -e "     $SAWTAK_ENGINE_SOCKET"
    echo -e "     Set SAWTAK_ENGINE_SOCKET to something shorter, e.g. /tmp/sawtak-engine.sock"
    exit 1
fi
# uvicorn chmods the socket 0666; the 0700 directory is what keeps other users out.
mkdir -p "$(dirname "$SAWTAK_ENGINE_SOCKET")"
# An override into a shared directory (/tmp) is not ours to lock down.
chmod 700 "$(dirname "$SAWTAK_ENGINE_SOCKET")" 2>/dev/null || true

if curl -sf --unix-socket "$SAWTAK_ENGINE_SOCKET" http://engine/api/health >/dev/null 2>&1; then
    # The desktop app, or another dev.sh. Starting a second engine would
    # replace its socket out from under it.
    echo -e "  ${GREEN}✓ An engine is already answering on the socket — reusing it${NC}"
else
    # Nothing answered, so any file there is a stale socket from a run that
    # died. `--reload` binds it itself and fails with EADDRINUSE rather than
    # replacing it.
    rm -f "$SAWTAK_ENGINE_SOCKET"
    echo -e "  Starting FastAPI on unix:$SAWTAK_ENGINE_SOCKET..."
    "$VENV_UVICORN" main:app --reload --uds "$SAWTAK_ENGINE_SOCKET" &
    TTS_PID=$!
    echo -e "  ${GREEN}✓ TTS Engine starting (PID: $TTS_PID)${NC}"

    # Wait a moment for the server to initialize
    sleep 2
fi

# -----------------------------------------------------------
# 2. Start Next.js Dev Server
# -----------------------------------------------------------
echo -e "\n${YELLOW}[2/2] Starting Next.js dev server...${NC}"

cd "$PROJECT_DIR"

# A browser needs a TCP port, but not a famous one. Start from an uncommon
# number and walk up past anything already listening, rather than taking 3000
# from whichever other project wanted it.
WEB_PORT="${SAWTAK_WEB_PORT:-43117}"
while lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; do
    WEB_PORT=$((WEB_PORT + 1))
done

npm run dev -- --hostname 127.0.0.1 --port "$WEB_PORT" &
NEXT_PID=$!
echo -e "  ${GREEN}✓ Next.js starting on port $WEB_PORT (PID: $NEXT_PID)${NC}"

# -----------------------------------------------------------
# Ready!
# -----------------------------------------------------------
echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   🚀 All services running!                      ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║   Next.js:    http://127.0.0.1:$WEB_PORT"
echo "║   TTS Engine: unix:$SAWTAK_ENGINE_SOCKET"
echo "║   Probe it:   curl --unix-socket <socket> http://e/api/health"
echo "║                                                  ║"
echo "║   Press Ctrl+C to stop all services              ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Wait for background processes
wait
