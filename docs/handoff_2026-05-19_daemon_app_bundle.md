# Handoff — Sign + ship cosmos-mcp daemon as a notarized .app bundle

Self-contained brief. Date: 2026-05-19. A fresh agent or future-you can execute this without back-context.

The goal is to get iMessage + Calendar syncs working under launchd by giving the daemon its own Apple-signed bundle id that the user adds to Full Disk Access. The current LaunchAgent invokes `/bin/bash`, which can't be FDA-granted without giving every script on the user's machine FDA — so iMessage and Calendar fail with EPERM every tick. Browser works because its readers snapshot-copy the SQLite DBs into `$TMPDIR`, dodging the TCC check.

## Current state (already shipped, don't redo)

- `@polarity-lab/cosmos-mcp@0.5.0` is on npm with `daemon install / uninstall / status` subcommands.
- LaunchAgent lives at `~/Library/LaunchAgents/com.polaritylab.cosmos-mcp.sync.plist`.
- Runner script lives at `~/Library/Application Support/cosmos-mcp/daemon-run.sh`.
- Runner script logs to `~/Library/Logs/cosmos-mcp/daemon.log`.
- Verified failure: `EPERM scandir /Users/<u>/Library/Application Support/AddressBook/Sources` (iMessage) and `EPERM copyfile /Users/<u>/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb` (Calendar).
- Browser sync verified working — last tick uploaded 1,500+ pages.
- Source code for the daemon entrypoint lives in `bin/cosmos-mcp.js` under `runDaemon()`.

## Target architecture

- A native macOS .app bundle named `Cosmos Sync.app`, bundle id `com.polaritylab.cosmos-mcp-daemon`, `LSBackgroundOnly=true` (no Dock icon, no menu bar), no UI.
- The .app's only executable is a tiny launcher that `execve`s the existing `daemon-run.sh`. All actual sync logic stays where it is — we are only changing what launchd points at.
- The .app is built once on a Mac with the Developer ID cert, notarized + stapled, then committed into the npm package at `dist/CosmosSync.app/`.
- `cosmos-mcp daemon install` copies the .app from the package into `~/Applications/Cosmos Sync.app`, writes a LaunchAgent plist whose `ProgramArguments[0]` is the .app's executable path, runs `lsregister`, prints instructions for the FDA grant, and `launchctl kickstart`s the first run.
- The user opens System Settings → Privacy & Security → Full Disk Access, drags `~/Applications/Cosmos Sync.app` into the list, ticks the checkbox. From that moment, every launchd-fired tick has FDA on AddressBook + Messages + Group Containers, so all three syncs succeed.

The launcher binary is intentionally trivial — it exists so macOS has a stable bundle id to key TCC entries on. Don't put any sync logic in it; we want all behavior driven by the same `daemon-run.sh` that the macOS path and the linux/cron path share.

## Apple Developer prerequisites

These already exist in the lab account, you just need to wire them up:

- **Developer ID Application certificate.** Not "Apple Development" or "Apple Distribution" — those are for the App Store. We need "Developer ID Application", which lets you ship outside the MAS and clear Gatekeeper. Generate from developer.apple.com → Certificates → Production → Developer ID Application. Install in login.keychain. `security find-identity -v -p codesigning` should show `Developer ID Application: <team name> (<team id>)`.
- **App Store Connect API key for notarization.** The lab already has one at `/Users/shadrack/projects/blueno-ios/.secrets/AuthKey_NCU5AG34VV.p8` (key id `NCU5AG34VV`). The issuer id is the missing piece — pull it from App Store Connect → Users and Access → Keys (top of page, "Issuer ID" UUID). Set the placeholder values in `blueno-ios/eas.json` while you're there.
- **Team ID.** Visible in the Developer ID cert subject. Needed for notarytool and as the bundle id namespace.

Store the Developer ID cert as a base64-encoded .p12 in repo secrets if you want a CI build (recommended; see below).

## Build pipeline

Single bash script at `scripts/build-daemon-app.sh` in the cosmos-mcp repo. Idempotent. Run locally for first version, then move to CI.

```bash
#!/usr/bin/env bash
# Build, sign, notarize, and staple Cosmos Sync.app into dist/CosmosSync.app.
# Requires: a Developer ID Application cert in login.keychain and an App Store
# Connect API .p8 key. See docs/handoff_2026-05-19_daemon_app_bundle.md.
set -euo pipefail

SIGN_IDENTITY="${SIGN_IDENTITY:-Developer ID Application: Polarity Lab (REPLACE_TEAM_ID)}"
NOTARY_KEY_PATH="${NOTARY_KEY_PATH:-$HOME/projects/blueno-ios/.secrets/AuthKey_NCU5AG34VV.p8}"
NOTARY_KEY_ID="${NOTARY_KEY_ID:-NCU5AG34VV}"
NOTARY_ISSUER_ID="${NOTARY_ISSUER_ID:-REPLACE_ISSUER_UUID}"

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

# Info.plist. LSBackgroundOnly hides the Dock icon entirely.
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
</dict>
</plist>
EOF

# Sign with hardened runtime + secure timestamp. Notarization rejects
# unhardened bundles. No entitlements file needed — the launcher doesn't
# touch any TCC-protected resource itself; that's daemon-run.sh's job,
# and TCC keys on the responsible-process bundle id (this one).
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
```

The Swift launcher at `src/daemon/launcher.swift`:

```swift
// Cosmos Sync launcher. Sole purpose: give launchd a stable Apple-signed
// bundle id to fire, so macOS TCC can grant Full Disk Access to one
// thing instead of /bin/bash. The actual sync logic lives in
// daemon-run.sh, written by `cosmos-mcp daemon install`.

import Foundation

let runnerPath = NSString(string: "~/Library/Application Support/cosmos-mcp/daemon-run.sh")
    .expandingTildeInPath

guard FileManager.default.fileExists(atPath: runnerPath) else {
    FileHandle.standardError.write(Data("cosmos-sync: runner not found at \(runnerPath). Run `cosmos-mcp daemon install` first.\n".utf8))
    exit(1)
}

// execve into /bin/bash with the runner so daemon-run.sh inherits this
// process's TCC entitlement (Full Disk Access granted to this .app's
// bundle id). Using exec instead of Process means the bash invocation
// IS the responsible process — TCC walks the responsibility chain via
// the parent's bundle id, and our parent IS the .app.
let argv: [String] = ["/bin/bash", runnerPath]
let cArgs = argv.map { strdup($0) } + [nil]
defer { cArgs.forEach { if let p = $0 { free(p) } } }
execv("/bin/bash", cArgs)

// execv only returns on failure.
FileHandle.standardError.write(Data("cosmos-sync: execv failed: \(String(cString: strerror(errno)))\n".utf8))
exit(2)
```

## Updated `cosmos-mcp daemon install` flow

Modify `bin/cosmos-mcp.js` `runDaemon()` to:

1. Verify `dist/CosmosSync.app` exists inside the published package (it will, because we add it to `files` in `package.json`).
2. `cp -R` the .app into `~/Applications/Cosmos Sync.app` (create `~/Applications/` if missing — it's a standard user-level location and doesn't require sudo, but System Settings shows both `/Applications` and `~/Applications` in FDA).
3. `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f` the new location so Launch Services picks up the bundle.
4. Write `~/Library/LaunchAgents/com.polaritylab.cosmos-mcp.sync.plist` with:
   - `ProgramArguments` = `["~/Applications/Cosmos Sync.app/Contents/MacOS/cosmos-sync"]`
   - Same `StartInterval`, `RunAtLoad`, log paths as today.
   - Keep the `EnvironmentVariables PATH` so child npx invocations resolve.
5. `launchctl unload` (ignore failure if not loaded) then `launchctl load`.
6. `launchctl kickstart -k gui/$UID/com.polaritylab.cosmos-mcp.sync` for the first run.
7. **Print this to stdout, verbatim, no emoji:**

   ```
   cosmos sync daemon installed.

   one manual step on macOS to enable iMessage + calendar:
     1. open System Settings → Privacy & Security → Full Disk Access
     2. click +, then drag "~/Applications/Cosmos Sync.app" into the list
     3. make sure the checkbox next to it is on
     4. run: cosmos-mcp daemon kick

   browser sync already works without that step. logs:
     tail -f ~/Library/Logs/cosmos-mcp/daemon.log
   ```

8. Add a new subcommand `cosmos-mcp daemon kick` that just runs `launchctl kickstart -k gui/$UID/com.polaritylab.cosmos-mcp.sync`. Saves the user the verbose incantation.

`cosmos-mcp daemon uninstall` needs to also `rm -rf ~/Applications/Cosmos Sync.app`. `cosmos-mcp daemon status` should `codesign -dv ~/Applications/Cosmos Sync.app 2>&1 | grep TeamIdentifier` and report it, so the user can verify they're running the signed version.

## Package shipping

In `package.json`:

```json
{
  "version": "0.6.0",
  "files": [
    "bin/",
    "dist/"
  ]
}
```

The .app sits inside `dist/CosmosSync.app/`. Verify with `npm pack --dry-run` that the .app is included with executable bits preserved. If npm strips the executable bit (it sometimes does on binaries inside nested folders), add a `postinstall` script that does `chmod +x ./node_modules/@polarity-lab/cosmos-mcp/dist/CosmosSync.app/Contents/MacOS/cosmos-sync`.

The .app adds ~150KB to the tarball (Swift launcher is tiny). Acceptable.

## CI build (recommended once it works locally)

`.github/workflows/build-daemon-app.yml`:

```yaml
name: Build daemon .app
on:
  push:
    tags: ['v*']
  workflow_dispatch:
jobs:
  build:
    runs-on: macos-13
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Import Developer ID cert
        env:
          DEV_ID_P12_BASE64: ${{ secrets.DEV_ID_P12_BASE64 }}
          DEV_ID_P12_PASSWORD: ${{ secrets.DEV_ID_P12_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          echo "$DEV_ID_P12_BASE64" | base64 -d > /tmp/cert.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security import /tmp/cert.p12 -k build.keychain -P "$DEV_ID_P12_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" build.keychain
      - name: Write notary key
        env: { NOTARY_KEY_P8: ${{ secrets.NOTARY_KEY_P8 }} }
        run: |
          mkdir -p .secrets
          echo "$NOTARY_KEY_P8" > .secrets/AuthKey.p8
      - run: npm ci
      - env:
          SIGN_IDENTITY: ${{ secrets.SIGN_IDENTITY }}
          NOTARY_KEY_PATH: .secrets/AuthKey.p8
          NOTARY_KEY_ID: ${{ secrets.NOTARY_KEY_ID }}
          NOTARY_ISSUER_ID: ${{ secrets.NOTARY_ISSUER_ID }}
        run: bash scripts/build-daemon-app.sh
      - uses: actions/upload-artifact@v4
        with:
          name: CosmosSync.app
          path: dist/CosmosSync.app
```

Required GitHub secrets:
- `DEV_ID_P12_BASE64` — `base64 -i developer-id.p12 | pbcopy`
- `DEV_ID_P12_PASSWORD` — chosen when exporting the .p12
- `KEYCHAIN_PASSWORD` — any string, ephemeral
- `NOTARY_KEY_P8` — full text of the .p8 file
- `NOTARY_KEY_ID` — `NCU5AG34VV` (existing lab key)
- `NOTARY_ISSUER_ID` — UUID from App Store Connect
- `SIGN_IDENTITY` — `Developer ID Application: Polarity Lab (TEAMID)`

The npm publish should happen separately (manual or another workflow), after downloading the built .app artifact into `dist/`.

## File checklist for the executor

- `scripts/build-daemon-app.sh` — the bash script above
- `src/daemon/launcher.swift` — the Swift launcher above
- `bin/cosmos-mcp.js` — modify `runDaemon()` to use the .app path, add `kick` subcommand, update uninstall + status
- `package.json` — bump to 0.6.0, add `"files": ["bin/", "dist/"]`
- `.github/workflows/build-daemon-app.yml` — the CI workflow above
- `docs/handoff_2026-05-19_daemon_app_bundle.md` — this file, mark sections done as you go
- `README.md` — short addition: "macOS: after installing the daemon, grant Full Disk Access to `~/Applications/Cosmos Sync.app`"

## Definitions of done

- `npm pack --dry-run` shows `dist/CosmosSync.app/Contents/MacOS/cosmos-sync` with mode 755.
- `npm publish` 0.6.0 to npm with `--access public`.
- `mcp-publisher publish` after `mcp-publisher login github` to refresh the MCP Registry to 0.6.0.
- On a fresh Mac with no prior cosmos-mcp install:
  - `npx -y @polarity-lab/cosmos-mcp daemon install` prints the FDA-grant instructions.
  - User adds `~/Applications/Cosmos Sync.app` to FDA in System Settings.
  - `cosmos-mcp daemon kick` triggers a tick.
  - `~/Library/Logs/cosmos-mcp/daemon.log` shows `[imessage] cosmos · iMessage sync ...` and `[calendar] cosmos · Calendar sync ...` both succeeding (no EPERM lines).
- Verify on this user's machine (Shadrack, user_id=69):
  - Existing daemon at `~/Library/LaunchAgents/com.polaritylab.cosmos-mcp.sync.plist` is replaced by the .app-based version on next `daemon install`.
  - First post-grant tick produces from_handle-bearing rows in `conversation_turns` (check with `SELECT COUNT(*) FROM conversation_turns WHERE user_id=69 AND from_handle IS NOT NULL`).
  - `/api/cron/conversations-extract` next tick produces observation nodes (check by watching `nodes.created_at` for new rows with `json_extract(content, '$.via') = 'conversation-extract'`).

## Known unknowns / things to watch

- **npm tarball binary handling.** If `chmod +x` is lost on publish, the launcher won't run after `npx -y` extraction. The postinstall workaround is documented above. Test with `npm pack --dry-run` before publish.
- **`~/Applications` FDA behavior.** Modern macOS allows TCC entries for both `/Applications` and `~/Applications`. If TCC refuses the user-level location on the user's macOS version, fall back to copying to `/Applications` and warn the install will need `sudo`. Test on macOS 14 + 15.
- **Universal binary requirement.** Apple Silicon Macs prefer arm64, Intel Macs need x86_64. The lipo step in the build script handles both. If you ship arm64-only, Intel Macs hit Gatekeeper rejection.
- **execv vs Process vs NSTask.** The launcher uses `execv` deliberately — it replaces the current process so the child inherits the .app's TCC entitlement directly. Using `Foundation.Process` or `NSTask` spawns a child whose responsible process might be detected differently by TCC. Don't refactor to "nicer" Swift; the execv is load-bearing.
- **Hardened runtime entitlements.** The current build uses `--options runtime` with no entitlements file. This works because the launcher itself doesn't touch protected resources directly. If notarization fails with a `com.apple.security.cs.disable-library-validation` complaint, add a minimal `entitlements.plist` allowing JIT and unsigned executable memory (only if actually rejected — Apple's notary scanner is generally fine without).
- **MCP Registry republish.** `mcp-publisher` uses a device-flow GitHub login that times out fast and can't be scripted. Account for this in any release runbook.

## What to NOT do

- Don't put any sync logic in the Swift launcher. It exists only as a TCC anchor.
- Don't make the .app foregrounded or give it a UI. `LSBackgroundOnly=true` is correct.
- Don't ship the `.app` unsigned to npm "for testing." Unsigned apps trigger Gatekeeper, the user blames cosmos-mcp, and they uninstall. Sign every build.
- Don't put the Developer ID cert .p12 in the npm package. It belongs in CI secrets.
- Don't change the bundle id between releases. The FDA grant is keyed on `com.polaritylab.cosmos-mcp-daemon`; rotating it makes every existing user re-grant.

## Estimate

First version end-to-end (build + sign + notarize + npm publish + verified on one fresh Mac): half a day if the lab's Developer ID cert is already in the keychain, full day if you need to mint it and chase down the App Store Connect issuer UUID. The hardest part is the first notarization round-trip — once you've seen Apple accept a build, every subsequent rev is a re-run of the same script.
