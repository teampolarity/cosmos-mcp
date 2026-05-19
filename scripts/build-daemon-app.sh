#!/usr/bin/env bash
# Build, sign, notarize, and staple Cosmos Sync.app into dist/CosmosSync.app.
# Requires: a Developer ID Application cert in login.keychain and an App Store
# Connect API .p8 key. See docs/handoff_2026-05-19_daemon_app_bundle.md.
set -euo pipefail

SIGN_IDENTITY="${SIGN_IDENTITY:-Developer ID Application: Theodore Addo (SA5F7PACJE)}"
NOTARY_KEY_PATH="${NOTARY_KEY_PATH:-$HOME/projects/blueno-ios/.secrets/AuthKey_8F38V68Y2K.p8}"
NOTARY_KEY_ID="${NOTARY_KEY_ID:-8F38V68Y2K}"
NOTARY_ISSUER_ID="${NOTARY_ISSUER_ID:-9e78df19-ca2e-444f-8726-3749a32e55db}"

APP_NAME="Cosmos Sync"
BUNDLE_ID="com.polaritylab.cosmos-mcp-daemon"
SHORT_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="$(date +%Y%m%d%H%M)"

OUT_DIR="dist/CosmosSync.app"
CONTENTS="$OUT_DIR/Contents"
MACOS="$CONTENTS/MacOS"

rm -rf "$OUT_DIR"
mkdir -p "$MACOS" "$CONTENTS/Resources"

# Compile the launcher binary. Universal (x86_64 + arm64) so a single .app
# works on every modern Mac. The launcher only execs daemon-run.sh.
swiftc -O \
  -target arm64-apple-macos11 \
  -o "$MACOS/cosmos-sync-arm64" \
  src/daemon/launcher.swift
swiftc -O \
  -target x86_64-apple-macos11 \
  -o "$MACOS/cosmos-sync-x86_64" \
  src/daemon/launcher.swift
lipo -create "$MACOS/cosmos-sync-arm64" "$MACOS/cosmos-sync-x86_64" \
  -output "$MACOS/cosmos-sync"
rm "$MACOS/cosmos-sync-arm64" "$MACOS/cosmos-sync-x86_64"
chmod +x "$MACOS/cosmos-sync"

# cosmos-eventkit — the calendar reader. Standalone signed binary with an
# embedded __info_plist section carrying the calendar usage strings, so
# macOS shows a Calendars TCC prompt on first run and keys the grant on
# this binary's designated requirement. Compiled universal like the
# launcher. The macOS 14 EventKit symbols it uses are weak-linked behind
# an `if #available` guard, so a macos11 deployment target is fine.
EVENTKIT_PLIST="$(mktemp -t cosmos-eventkit-plist).plist"
cat > "$EVENTKIT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.polaritylab.cosmos-mcp-eventkit</string>
  <key>CFBundleName</key><string>Cosmos Calendar Reader</string>
  <key>CFBundleShortVersionString</key><string>${SHORT_VERSION}</string>
  <key>NSCalendarsUsageDescription</key><string>Cosmos reads your calendar events to build your personal knowledge graph.</string>
  <key>NSCalendarsFullAccessUsageDescription</key><string>Cosmos reads your calendar events to build your personal knowledge graph.</string>
</dict>
</plist>
EOF
for ARCH in arm64 x86_64; do
  swiftc -O \
    -target "${ARCH}-apple-macos11" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$EVENTKIT_PLIST" \
    -o "$MACOS/cosmos-eventkit-${ARCH}" \
    src/daemon/eventkit-bridge.swift
done
lipo -create "$MACOS/cosmos-eventkit-arm64" "$MACOS/cosmos-eventkit-x86_64" \
  -output "$MACOS/cosmos-eventkit"
rm "$MACOS/cosmos-eventkit-arm64" "$MACOS/cosmos-eventkit-x86_64" "$EVENTKIT_PLIST"
chmod +x "$MACOS/cosmos-eventkit"

# Info.plist. LSBackgroundOnly hides the Dock icon entirely. The calendar
# usage strings are mirrored here so TCC has them whether it attributes a
# calendar request to the bundle or to the cosmos-eventkit binary.
cat > "$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>cosmos-sync</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${SHORT_VERSION}</string>
  <key>CFBundleVersion</key><string>${BUILD_NUMBER}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSBackgroundOnly</key><true/>
  <key>NSHumanReadableCopyright</key><string>© Polarity Lab</string>
  <key>NSCalendarsUsageDescription</key><string>Cosmos reads your calendar events to build your personal knowledge graph.</string>
  <key>NSCalendarsFullAccessUsageDescription</key><string>Cosmos reads your calendar events to build your personal knowledge graph.</string>
</dict>
</plist>
EOF

# Sign with hardened runtime + secure timestamp. Notarization rejects
# unhardened bundles. Sign nested binaries before the bundle itself —
# codesign seals inner code into the bundle signature, so order matters.
# No entitlements file: the launcher only execs daemon-run.sh, and
# cosmos-eventkit reaches EventKit through TCC consent, not entitlements.
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$MACOS/cosmos-eventkit"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$MACOS/cosmos-sync"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$OUT_DIR"

# Verify before submission. Catches the common "unsigned executable" trap.
codesign --verify --deep --strict --verbose=2 "$OUT_DIR"
spctl --assess --type execute --verbose=4 "$OUT_DIR" || true   # spctl will fail until notarized; informational only

# Notarize. notarytool waits for the verdict synchronously and exits non-zero
# on rejection. Apple's median turnaround is ~3 minutes, max ~15.
ZIP_PATH="dist/CosmosSync.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$OUT_DIR" "$ZIP_PATH"

xcrun notarytool submit "$ZIP_PATH" \
  --key "$NOTARY_KEY_PATH" \
  --key-id "$NOTARY_KEY_ID" \
  --issuer "$NOTARY_ISSUER_ID" \
  --wait

# Staple the ticket so the bundle works offline. Without this, first-run
# Gatekeeper check requires network.
xcrun stapler staple "$OUT_DIR"
xcrun stapler validate "$OUT_DIR"

echo "✓ dist/CosmosSync.app built, signed, notarized, stapled."
