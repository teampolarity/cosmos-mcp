#!/usr/bin/env bash
# Copy the canonical noise lists from cosmos-mcp's CLI source into the
# extension's shared/ so the in-browser filter stays in lockstep with the
# CLI's `cosmos-mcp browser sync`. Both live in this same repo
# (extension at browser-extension/, CLI at src/sources/browser/), so the
# relative path is stable.
#
# Run this whenever ../src/sources/browser/filter-rules.json changes.
#
# Usage: ./scripts/sync-filter-rules.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$(cd "$HERE/.." && pwd)/src/sources/browser/filter-rules.json"
DEST="$HERE/shared/filter-rules.json"

if [ ! -f "$SRC" ]; then
  echo "filter-rules.json not found at $SRC" >&2
  echo "expected layout: cosmos-mcp/src/sources/browser/filter-rules.json" >&2
  exit 1
fi

cp "$SRC" "$DEST"
echo "synced filter-rules.json from $SRC"
echo "  -> $DEST"
