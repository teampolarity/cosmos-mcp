#!/usr/bin/env bash
# Build, sign, notarize, and staple Cosmos Sync.app into dist/CosmosSync.app.
# Requires: a Developer ID Application cert in login.keychain and an App Store
# Connect API .p8 key. See docs/handoff_2026-05-19_daemon_app_bundle.md.
set -euo pipefail

SIGN_IDENTITY="${SIGN_IDENTITY:-$(bash "$(dirname "$0")/resolve-sign-identity.sh")}"
NOTARY_KEY_PATH="${NOTARY_KEY_PATH:-$HOME/projects/blueno-ios/.secrets/AuthKey_8F38V68Y2K.p8}"
NOTARY_KEY_ID="${NOTARY_KEY_ID:-8F38V68Y2K}"
NOTARY_ISSUER_ID="${NOTARY_ISSUER_ID:-9e78df19-ca2e-444f-8726-3749a32e55db}"

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
  src/daemon/ConnectSheetView.swift \
  src/daemon/NativeSettingsView.swift \
  src/daemon/NativeThreadView.swift \
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

echo "✓ dist/Cosmos.app built, signed, notarized, stapled."
