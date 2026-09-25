#!/usr/bin/env bash
#
# Build the Python runtime that ships inside Sawtak.app.
#
# The dev venv cannot be bundled: `venv/bin/python` is a symlink to a
# uv-managed interpreter elsewhere on the machine, and a venv records absolute
# paths. uv's managed CPython builds (python-build-standalone) are relocatable,
# so this copies one wholesale and installs the engine's packages straight into
# it. The result runs from wherever the .app is dragged.
#
# Output: build/python-runtime/ — electron-builder copies it to
# Contents/Resources/python.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="build/python-runtime"
PY_VERSION="3.11"

command -v uv >/dev/null || { echo "uv is required: brew install uv" >&2; exit 1; }

uv python install "$PY_VERSION" >/dev/null
SRC_BIN="$(uv python find --managed-python "$PY_VERSION")"
SRC_ROOT="$(cd "$(dirname "$(readlink -f "$SRC_BIN")")/.." && pwd)"

echo "runtime  <- $SRC_ROOT"
rm -rf "$OUT"
mkdir -p "$(dirname "$OUT")"
cp -R "$SRC_ROOT" "$OUT"
PY="$OUT/bin/python$PY_VERSION"

# The copy is ours to install into; uv marks managed interpreters read-only.
find "$OUT/lib" -maxdepth 2 -name EXTERNALLY-MANAGED -delete

export HF_HUB_DISABLE_XET=1
uv pip install --python "$PY" --break-system-packages -r tts-engine/requirements-desktop.txt

# Same --no-deps staging as scripts/setup.sh: OmniVoice declares
# transformers>=5.3.0 for one class that engines/vendor/higgs_codec already
# provides, plus a training stack (gradio, tensorboardx, webdataset) that
# inference never imports.
uv pip install --python "$PY" --break-system-packages --no-deps \
    "git+https://github.com/k2-fsa/OmniVoice.git" \
    voicetut-tts \
    accelerate

# Weight that is never loaded at runtime: C headers, test suites, bytecode
# caches (regenerated on first import), and pip itself.
rm -rf "$OUT/include" "$OUT/share"
SITE="$OUT/lib/python$PY_VERSION/site-packages"
rm -rf "$SITE"/torch/include "$SITE"/torch/share
find "$OUT" -type d \( -name __pycache__ -o -name tests -o -name test \) -prune -exec rm -rf {} +
rm -rf "$OUT/lib/python$PY_VERSION/test" "$OUT/lib/python$PY_VERSION/idlelib" "$OUT/lib/python$PY_VERSION/tkinter"

# Smoke test: the engine's imports must resolve from the bundled interpreter.
(cd tts-engine && "../$PY" -c "import main" )
du -sh "$OUT"
