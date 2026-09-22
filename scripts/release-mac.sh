#!/usr/bin/env bash
#
# Publish the macOS build as a GitHub release.
#
# The landing page links to ONE evergreen URL:
#
#   .../releases/latest/download/Sawtak-macOS-arm64.dmg
#
# `/releases/latest/download/<asset>` resolves to whatever the newest release
# attached under that exact filename, which is what lets the page survive a
# version bump without an edit. electron-builder names its output
# Sawtak-<version>-arm64.dmg, so the rename below is not cosmetic — it is the
# half of the contract that lives on this side. Change it and every download
# button on the site 404s.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
SOURCE="dist-electron/Sawtak-${VERSION}-arm64.dmg"
ASSET_NAME="Sawtak-macOS-arm64.dmg"
TAG="v${VERSION}"

if [ ! -f "$SOURCE" ]; then
  echo "No build at $SOURCE — run 'npm run electron:dist' first." >&2
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo "The GitHub CLI is not installed. 'brew install gh && gh auth login'." >&2
  exit 1
fi

STAGED="$(mktemp -d)/${ASSET_NAME}"
cp "$SOURCE" "$STAGED"
echo "staged $(du -h "$STAGED" | cut -f1) -> ${ASSET_NAME}"

# --clobber so re-running after a fixed build replaces the asset instead of
# failing on a name collision.
if gh release view "$TAG" &> /dev/null; then
  echo "release $TAG exists — replacing its asset"
  gh release upload "$TAG" "$STAGED" --clobber
else
  gh release create "$TAG" "$STAGED" \
    --title "Sawtak ${VERSION} — macOS (Apple Silicon)" \
    --notes "$(cat <<'NOTES'
تطبيق **صوتك** للماك (Apple Silicon).

التطبيق مابيجيش ومعاه النموذج. قبل أول تشغيل لازم تظبّط النموذج مرة واحدة:

```
git clone -b voicetut https://github.com/ahmed0thman/my-tts.git ~/sawtak
cd ~/sawtak && ./scripts/setup.sh
```

محتاج Homebrew و Node 24+ و uv. التفاصيل كلها على صفحة التطبيق.

المسار `~/sawtak` مهم: التطبيق بيدوّر فيه لوحده. لو ظبّطته في مكان تاني،
شغّله و `SAWTAK_DATA_ROOT` مظبوطة على المكان ده.
NOTES
)"
fi

echo
echo "done. the landing page's download button now resolves to:"
echo "  https://github.com/ahmed0thman/my-tts/releases/latest/download/${ASSET_NAME}"
