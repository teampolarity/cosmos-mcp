#!/usr/bin/env bash
# Build a zipped extension package for one target (chrome | firefox).
# Picks the right manifest.<target>.json, drops a manifest.json in a
# clean dist/<target>/ tree, copies the shared files, and zips it.
#
# Usage: ./scripts/build.sh chrome
#        ./scripts/build.sh firefox

set -euo pipefail

TARGET="${1:-}"
if [ "$TARGET" != "chrome" ] && [ "$TARGET" != "firefox" ]; then
  echo "usage: $0 <chrome|firefox>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/$TARGET"
ZIP="$ROOT/dist/cosmos-browser-extension-$TARGET.zip"

rm -rf "$DIST"
mkdir -p "$DIST/icons" "$DIST/shared"

cp "$ROOT/manifest.$TARGET.json"        "$DIST/manifest.json"
cp "$ROOT/background.js"                "$DIST/background.js"
cp "$ROOT/filter.js"                    "$DIST/filter.js"
cp "$ROOT/popup.html"                   "$DIST/popup.html"
cp "$ROOT/popup.js"                     "$DIST/popup.js"
cp "$ROOT/options.html"                 "$DIST/options.html"
cp "$ROOT/options.js"                   "$DIST/options.js"
cp "$ROOT/shared/filter-rules.json"     "$DIST/shared/filter-rules.json"
cp -R "$ROOT/icons/." "$DIST/icons/" 2>/dev/null || true

rm -f "$ZIP"
(cd "$DIST" && zip -qr "$ZIP" .)
echo "built $TARGET"
echo "  dir: $DIST"
echo "  zip: $ZIP"
