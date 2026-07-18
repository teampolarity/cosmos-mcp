#!/usr/bin/env bash
# Build, sign, notarize, and staple Cosmos.app into dist/Cosmos.app.
# Requires: a Developer ID Application cert in login.keychain and an App Store
# Connect API .p8 key. See docs/macos-release-signing.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIGN_IDENTITY="$(bash "$SCRIPT_DIR/resolve-sign-identity.sh")"
NOTARY_KEY_PATH="${NOTARY_KEY_PATH:-/Users/shadrack/projects/cosmos/.secrets/apple/AuthKey_CHA2KDX6C4.p8}"
NOTARY_KEY_ID="${NOTARY_KEY_ID:-CHA2KDX6C4}"

if [[ -z "${NOTARY_ISSUER_ID:-}" ]]; then
  echo "build-daemon-app: NOTARY_ISSUER_ID is required for notarization" >&2
  echo "  copy the Issuer ID from App Store Connect → Users and Access → Integrations" >&2
  exit 1
fi
if [[ ! "$NOTARY_ISSUER_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "build-daemon-app: NOTARY_ISSUER_ID must be a UUID" >&2
  exit 1
fi
if [[ ! "$NOTARY_KEY_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "build-daemon-app: NOTARY_KEY_ID must be a 10-character App Store Connect key id" >&2
  exit 1
fi
if [[ ! -r "$NOTARY_KEY_PATH" ]]; then
  echo "build-daemon-app: notary key is not readable at $NOTARY_KEY_PATH" >&2
  exit 1
fi

APP_NAME="Cosmos"
BUNDLE_ID="com.polaritylab.cosmos-mcp-daemon"
SHORT_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="$(date +%Y%m%d%H%M)"

OUT_DIR="dist/Cosmos.app"
CONTENTS="$OUT_DIR/Contents"
MACOS="$CONTENTS/MacOS"

rm -rf "$OUT_DIR"
mkdir -p "$MACOS" "$CONTENTS/Resources/en.lproj"

build_universal() {
  local out=$1
  shift
  local link_flags=()
  if [[ "$out" == "cosmos-sync" ]]; then
    link_flags=(-lsqlite3 -framework SwiftUI -framework WebKit -framework AuthenticationServices)
  fi
  swiftc -O -target arm64-apple-macos11 -o "$MACOS/${out}-arm64" ${link_flags+"${link_flags[@]}"} "$@"
  swiftc -O -target x86_64-apple-macos11 -o "$MACOS/${out}-x86_64" ${link_flags+"${link_flags[@]}"} "$@"
  lipo -create "$MACOS/${out}-arm64" "$MACOS/${out}-x86_64" -output "$MACOS/$out"
  rm "$MACOS/${out}-arm64" "$MACOS/${out}-x86_64"
  chmod +x "$MACOS/$out"
}

# launchd fires cosmos-sync-daemon → daemon-run.sh (Full Disk Access)
build_universal cosmos-sync-daemon src/daemon/launcher.swift
# Menu bar UI (login item / double-click)
build_universal cosmos-sync \
  src/daemon/MenuApp.swift \
  src/daemon/UpdateProgressPanel.swift \
  src/daemon/McpRunner.swift \
  src/daemon/AppState.swift \
  src/daemon/FdaChecker.swift \
  src/daemon/CosmosAuthStore.swift \
  src/daemon/CosmosAuthClient.swift \
  src/daemon/LoginWindowController.swift \
  src/daemon/CosmosTheme.swift \
  src/daemon/SyncConfigStore.swift \
  src/daemon/CosmosAPIClient.swift \
  src/daemon/CosmosNotifications.swift \
  src/daemon/McpKeyStore.swift \
  src/daemon/McpURLHandler.swift \
  src/daemon/ConnectSheetView.swift \
  src/daemon/NativeSettingsView.swift \
  src/daemon/NativeTodayView.swift \
  src/daemon/NativeThreadView.swift \
  src/daemon/NativeKnowView.swift \
  src/daemon/CosmosAppView.swift \
  src/daemon/SettingsWindowController.swift \
  src/daemon/CosmosWebStore.swift \
  src/daemon/ThreadWindowController.swift

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
  <key>LSUIElement</key><false/>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
  <key>LSHasLocalizedDisplayName</key><true/>
  <key>NSHumanReadableCopyright</key><string>© Polarity Lab</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>com.polaritylab.cosmos-mcp</string>
      <key>CFBundleURLSchemes</key>
      <array><string>cosmos-mcp</string></array>
    </dict>
  </array>
</dict>
</plist>
EOF

cat > "$CONTENTS/Resources/en.lproj/InfoPlist.strings" <<EOF
CFBundleDisplayName = "Cosmos";
CFBundleName = "Cosmos";
EOF

bash "$(dirname "$0")/render-app-icons.sh" "$CONTENTS/Resources"

codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$MACOS/cosmos-sync-daemon"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$MACOS/cosmos-sync"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" \
  "$OUT_DIR"

codesign --verify --deep --strict --verbose=2 "$OUT_DIR"
if [[ -n "${POLARITY_TEAM_ID:-}" ]]; then
  signed_team="$(codesign -dv --verbose=4 "$OUT_DIR" 2>&1 \
    | awk -F= '$1 == "TeamIdentifier" && !found { print $2; found = 1 }')"
  if [[ "$signed_team" != "$POLARITY_TEAM_ID" ]]; then
    echo "build-daemon-app: signed app TeamIdentifier does not match POLARITY_TEAM_ID" >&2
    echo "  signed team: ${signed_team:-missing}" >&2
    echo "  expected team: $POLARITY_TEAM_ID" >&2
    exit 1
  fi
fi
spctl --assess --type execute --verbose=4 "$OUT_DIR" || true

ZIP_PATH="dist/Cosmos.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$OUT_DIR" "$ZIP_PATH"

xcrun notarytool submit "$ZIP_PATH" \
  --key "$NOTARY_KEY_PATH" \
  --key-id "$NOTARY_KEY_ID" \
  --issuer "$NOTARY_ISSUER_ID" \
  --wait

xcrun stapler staple "$OUT_DIR"
xcrun stapler validate "$OUT_DIR"
spctl --assess --type execute --verbose=4 "$OUT_DIR"

# The archive submitted above predates the stapled ticket. Rebuild the
# distribution artifact from the stapled bundle so it survives transport.
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$OUT_DIR" "$ZIP_PATH"

echo "✓ dist/Cosmos.app built, signed, notarized, stapled."
