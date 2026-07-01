#!/usr/bin/env bash
# One-shot installer helper. Opens Finder pointed at the built
# extension directory and Zen pointed at about:debugging so you can
# load the extension as a temporary add-on in two clicks.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-firefox}"

# Build first so dist/<target>/ is fresh.
"$ROOT/scripts/build.sh" "$TARGET"

# Finder: highlight the manifest so the about:debugging file picker
# starts in the right place.
open -R "$ROOT/dist/$TARGET/manifest.json"

# Zen: about:debugging path for loading temporary add-ons.
open -a "Zen" "about:debugging#/runtime/this-firefox"

echo ""
echo "------------------------------------------------------------"
echo "Two manual clicks left:"
echo "  1. In Zen, click \"Load Temporary Add-on…\""
echo "  2. In the file picker that opens, the manifest is already"
echo "     highlighted — pick it and click Open."
echo ""
echo "Then the extension toolbar icon appears. Click it and use the"
echo "popup's Options link to paste your pmk_… key."
echo "------------------------------------------------------------"
