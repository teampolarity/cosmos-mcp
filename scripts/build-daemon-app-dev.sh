#!/usr/bin/env bash
# Build Cosmos.app (menu bar + background daemon launcher). Unsigned dev build.
set -euo pipefail

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

# launchd + Full Disk Access entrypoint
build_universal cosmos-sync-daemon src/daemon/launcher.swift
# Menu bar UI (double-click / login item)
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

# TCC (Full Disk Access) binds to the code signature, not the display name.
# Linker-signed swiftc binaries show as "cosmos-sync-arm64" and break FDA
# after every rebuild. Sign the bundle so CFBundleIdentifier is authoritative.
# Sign in with Apple entitlement requires the capability on the bundle id in
# Apple Developer *and* a notarized build. Embedding it without that setup
# makes macOS refuse to launch (generic "can't be opened"). Magic-code login
# works without this entitlement; re-enable after SIWA is provisioned + notarized.
SIGN_ENT_ARGS=()
# ENTITLEMENTS="$(dirname "$0")/Cosmos.entitlements"

DEV_SIGN="${SIGN_IDENTITY:-}"
if [[ -z "$DEV_SIGN" ]]; then
  DEV_SIGN="$(bash "$(dirname "$0")/resolve-sign-identity.sh" 2>/dev/null || true)"
fi
if [[ -n "$DEV_SIGN" ]]; then
  echo "→ signing with: $DEV_SIGN"
  codesign --force --options runtime --timestamp --sign "$DEV_SIGN" "$MACOS/cosmos-sync-daemon"
  codesign --force --options runtime --timestamp --sign "$DEV_SIGN" "$MACOS/cosmos-sync"
  codesign --force --options runtime --timestamp --sign "$DEV_SIGN" "$OUT_DIR"
else
  echo "→ signing adhoc (grant Full Disk Access again after each rebuild)"
  codesign --force --sign - "$MACOS/cosmos-sync-daemon"
  codesign --force --sign - "$MACOS/cosmos-sync"
  codesign --force --sign - "$OUT_DIR"
fi
codesign --verify --deep --strict "$OUT_DIR" 2>/dev/null || true

USER_APPS="$HOME/Applications"
LEGACY_APP="$USER_APPS/Cosmos Sync.app"
if [[ -d "$LEGACY_APP" ]]; then
  rm -rf "$LEGACY_APP"
  echo "✓ removed legacy $LEGACY_APP"
fi
mkdir -p "$USER_APPS"
rm -rf "$USER_APPS/$APP_NAME.app"
cp -R "$OUT_DIR" "$USER_APPS/$APP_NAME.app"
echo "✓ installed to $USER_APPS/$APP_NAME.app"

echo "✓ $OUT_DIR built and signed. For notarized release: bash scripts/build-daemon-app.sh"
