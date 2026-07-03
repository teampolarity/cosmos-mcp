#!/usr/bin/env bash
# Rasterize cosmos orb SVGs into AppIcon.icns + menu bar PNG for Cosmos Sync.app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/assets"
RESOURCES="${1:-$ROOT/dist/Cosmos.app/Contents/Resources}"

mkdir -p "$RESOURCES"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

render_svg() {
  local svg=$1
  local size=$2
  local out=$3
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$svg" -o "$out"
    return
  fi
  qlmanage -t -s "$size" -o "$WORK" "$svg" >/dev/null 2>&1
  local base
  base="$(basename "$svg")"
  mv "$WORK/${base}.png" "$out"
}

ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
APP_ICON_SVG="$ASSETS/cosmos-app-icon.svg"
if [[ ! -f "$APP_ICON_SVG" ]]; then
  APP_ICON_SVG="$ASSETS/cosmos-orb.svg"
fi

for size in 16 32 128 256 512; do
  render_svg "$APP_ICON_SVG" "$size" "$ICONSET/icon_${size}x${size}.png"
  render_svg "$APP_ICON_SVG" "$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$RESOURCES/AppIcon.icns"

render_svg "$ASSETS/cosmos-orb-menubar.svg" 18 "$RESOURCES/cosmos-orb-menubar.png"
render_svg "$ASSETS/cosmos-orb-menubar.svg" 36 "$RESOURCES/cosmos-orb-menubar@2x.png"

echo "✓ icons → $RESOURCES"
