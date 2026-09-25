#!/usr/bin/env bash
#
# Copy a checkout's data into the installed app's own data folder.
#
# Until the app became self-contained, the installed Sawtak.app read and wrote
# the repository's prisma/namaa.db and storage/. It now keeps its data in
# ~/Library/Application Support/Sawtak. This carries existing voices, projects
# and history across once. The repo's copy is left untouched.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="$(pwd)"
DEST="${1:-$HOME/Library/Application Support/Sawtak}"

if [ -f "$DEST/sawtak.db" ]; then
  echo "The app already has a database at $DEST/sawtak.db — refusing to overwrite it." >&2
  exit 1
fi

mkdir -p "$DEST/storage/audio" "$DEST/storage/voice-samples"

# .backup rather than cp: a consistent copy even if something has it open.
sqlite3 "$REPO/prisma/namaa.db" ".backup '$DEST/sawtak.db'"
cp -p "$REPO"/storage/voice-samples/*.wav "$DEST/storage/voice-samples/" 2>/dev/null || true
cp -p "$REPO"/storage/audio/*.wav "$DEST/storage/audio/" 2>/dev/null || true

# Voice profiles store absolute paths to their reference clips. Generated clips
# store /storage/audio/… paths, which resolve against the data root already.
sqlite3 "$DEST/sawtak.db" "UPDATE VoiceProfile SET referenceAudioPath = replace(referenceAudioPath, '$REPO/storage/', '$DEST/storage/');"

echo "Copied to $DEST"
sqlite3 "$DEST/sawtak.db" "SELECT count(*) || ' voice profiles' FROM VoiceProfile; SELECT count(*) || ' projects' FROM Project;"
missing=0
while IFS= read -r p; do [ -f "$p" ] || missing=$((missing + 1)); done < <(sqlite3 "$DEST/sawtak.db" "SELECT referenceAudioPath FROM VoiceProfile")
echo "$missing voice files missing"
