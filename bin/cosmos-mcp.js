#!/usr/bin/env node
// cosmos-mcp CLI entrypoint.
//
// Routes top-level subcommands to compiled `dist/` modules. The provision /
// install-handler / imessage probe paths live inline here, both because they
// are tiny and because they must not depend on the rest of the build being
// present (e.g. `npx -y @polarity-lab/cosmos-mcp provision pmk_xxx` on a fresh
// install should not fail because better-sqlite3 hasn't been gyp-rebuilt yet).

import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, "..");

const [, , maybeSub, maybeSubSub, ...rest] = process.argv;

const KEYCHAIN_ACCOUNT = "cosmos-mcp";
const KEYCHAIN_SERVICE = "cosmos-mcp-key";
const DEFAULT_COSMOS_URL = process.env.COSMOS_BASE_URL || process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";

// Subcommands that must NOT auto-resolve a key (they either set it or do not
// need it). Everything else gets a key resolved into process.env.COSMOS_TOKEN
// before dispatch, so the existing compiled subcommands keep working unchanged.
const NO_KEY_SUBS = new Set(["provision", "install-handler", "daemon", "--help", "-h", "help", "--version", "-v"]);

if (maybeSub === "provision") {
  process.exit(await runProvision(maybeSubSub, rest));
} else if (maybeSub === "install-handler") {
  process.exit(await runInstallHandler());
} else if (maybeSub === "daemon") {
  process.exit(await runDaemon(maybeSubSub, rest));
} else if (maybeSub === "imessage" && maybeSubSub === "probe") {
  process.exit(await runImessageProbe());
} else if (maybeSub === "imessage" && maybeSubSub === "caption") {
  await ensureKeyOrExit(maybeSub);
  const { runCaptionCli } = await import("../dist/sources/imessage/caption.js");
  const code = await runCaptionCli(rest);
  process.exit(code);
} else if (maybeSub === "imessage") {
  await ensureKeyOrExit(maybeSub);
  const { runImessageCli } = await import("../dist/sources/imessage/cli.js");
  const code = await runImessageCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "browser") {
  await ensureKeyOrExit(maybeSub);
  const { runBrowserCli } = await import("../dist/sources/browser/cli.js");
  const code = await runBrowserCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "calendar") {
  await ensureKeyOrExit(maybeSub);
  const { runCalendarCli } = await import("../dist/sources/calendar/cli.js");
  const code = await runCalendarCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "init") {
  // init has its own browser-OAuth bootstrap; let it run with whatever key
  // state exists, but do not block on key resolution.
  await import("../dist/server.js");
} else {
  // Default: MCP stdio server. The server reads its own config (token file +
  // env). We still try to hydrate COSMOS_TOKEN from the keychain so a user
  // who provisioned via the URL handler does not need to also run `init`.
  resolveKeyIntoEnv();
  await import("../dist/server.js");
}

// ----- helpers ---------------------------------------------------------------

// Resolves the cosmos MCP key with this precedence:
//   1. COSMOS_TOKEN env (CI / power users)
//   2. COSMOS_MCP_KEY env (back-compat with existing config.ts)
//   3. macOS keychain (security find-generic-password)
//   4. legacy token file at ~/.config/cosmos-mcp/token (older installs)
// Returns the trimmed key string or null. Never throws.
function resolveKey() {
  const envTok = (process.env.COSMOS_TOKEN || "").trim();
  if (envTok) return envTok;
  const envMcp = (process.env.COSMOS_MCP_KEY || "").trim();
  if (envMcp) return envMcp;
  if (platform() === "darwin") {
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const trimmed = (out || "").trim();
      if (trimmed) return trimmed;
    } catch {
      /* fall through to file */
    }
  }
  try {
    const tokenFile = join(homedir(), ".config", "cosmos-mcp", "token");
    if (existsSync(tokenFile)) {
      const parsed = JSON.parse(readFileSync(tokenFile, "utf8"));
      const k = (parsed?.key || "").trim();
      if (k) return k;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Hydrate process.env.COSMOS_TOKEN from the resolved key so downstream compiled
// CLIs (which read process.env.COSMOS_TOKEN directly) pick it up unchanged.
function resolveKeyIntoEnv() {
  if ((process.env.COSMOS_TOKEN || "").trim()) return;
  const k = resolveKey();
  if (k) process.env.COSMOS_TOKEN = k;
}

async function ensureKeyOrExit(subName) {
  resolveKeyIntoEnv();
  if (!(process.env.COSMOS_TOKEN || "").trim()) {
    process.stderr.write(
      `no cosmos key configured. run: cosmos-mcp provision pmk_xxx ` +
        `(get a key from cosmos.polarity-lab.com/connectors)\n`,
    );
    process.exit(1);
  }
}

// ----- provision -------------------------------------------------------------

async function runProvision(keyArg, _rest) {
  if (platform() !== "darwin") {
    process.stderr.write(
      "keychain provisioning is macOS-only. set COSMOS_TOKEN in your shell instead.\n",
    );
    return 1;
  }
  const key = (keyArg || "").trim();
  if (!key) {
    process.stderr.write("usage: cosmos-mcp provision pmk_xxx\n");
    return 1;
  }
  if (!key.startsWith("pmk_")) {
    process.stderr.write("invalid key. expected a pmk_... key from cosmos.polarity-lab.com/connectors\n");
    return 2;
  }

  // Validate against cosmos. The MCP-key auth surface is /api/polarity/whoami
  // (X-MCP-Key header). /api/me uses cosmos JWTs, not MCP keys, so we cannot
  // probe with it. whoami is the canonical probe — see
  // functions/api/polarity/whoami.js in cosmos-fork.
  const url = new URL("/api/polarity/whoami", DEFAULT_COSMOS_URL);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-MCP-Key": key,
        "User-Agent": "cosmos-mcp/cli-provision",
      },
    });
  } catch (e) {
    process.stderr.write(`could not reach ${url.host}. ${(e && e.message) || e}\n`);
    return 1;
  }
  if (res.status === 401) {
    process.stderr.write("invalid key. get a fresh one from cosmos.polarity-lab.com/connectors\n");
    return 2;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    process.stderr.write(`cosmos rejected the key (${res.status}). ${body.slice(0, 200)}\n`);
    return 1;
  }
  let me;
  try {
    me = await res.json();
  } catch {
    process.stderr.write("cosmos returned a non-JSON body. try again in a moment.\n");
    return 1;
  }
  const userId = me?.polarity_user_id || me?.user_id || me?.cosmos_user_id;
  if (!userId) {
    process.stderr.write("cosmos returned no user id. try again, or contact team@polarity-lab.com.\n");
    return 1;
  }

  // Write to macOS system keychain. -U updates the existing entry in place.
  try {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-a", KEYCHAIN_ACCOUNT,
        "-s", KEYCHAIN_SERVICE,
        "-w", key,
        "-U",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (e) {
    process.stderr.write(`could not write to keychain. ${(e && e.message) || e}\n`);
    return 1;
  }

  // Also mirror into the legacy token file so the MCP stdio server (which
  // reads from there via loadConfig) keeps working without a separate init.
  // Best-effort; failures here are not fatal.
  try {
    const tokenDir = join(homedir(), ".config", "cosmos-mcp");
    const tokenFile = join(tokenDir, "token");
    mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
    writeFileSync(tokenFile, JSON.stringify({ key, user_id: String(userId) }, null, 2));
    chmodSync(tokenFile, 0o600);
  } catch {
    // ignore
  }

  process.stdout.write(`key provisioned for ${userId}\n`);
  return 0;
}

// ----- install-handler -------------------------------------------------------

async function runInstallHandler() {
  if (platform() !== "darwin") {
    process.stderr.write(
      "install-handler is macOS-only. set COSMOS_TOKEN in your shell instead.\n",
    );
    return 1;
  }

  const appDir = join(
    homedir(),
    "Library",
    "Application Support",
    "cosmos-mcp",
    "cosmos-mcp-handler.app",
  );
  const contentsDir = join(appDir, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const infoPlistPath = join(contentsDir, "Info.plist");
  const execPath = join(macosDir, "cosmos-mcp-handler");

  try {
    mkdirSync(macosDir, { recursive: true });
  } catch (e) {
    process.stderr.write(`could not create ${appDir}. ${(e && e.message) || e}\n`);
    return 1;
  }

  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.polaritylab.cosmos-mcp-handler</string>
  <key>CFBundleName</key>
  <string>cosmos-mcp handler</string>
  <key>CFBundleDisplayName</key>
  <string>cosmos-mcp handler</string>
  <key>CFBundleExecutable</key>
  <string>cosmos-mcp-handler</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.polaritylab.cosmos-mcp</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>cosmos-mcp</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

  // The handler script. Parses cosmos-mcp://provision?key=pmk_... from $1,
  // extracts the key, and shells out to the published cli to do the actual
  // provisioning. Notifications give the user feedback without a terminal.
  const handlerScript = `#!/bin/bash
# cosmos-mcp URL handler. Receives a cosmos-mcp://provision?key=pmk_... URL
# as $1 from Launch Services, extracts the key, and calls cosmos-mcp provision.

URL="$1"
if [ -z "$URL" ]; then
  /usr/bin/osascript -e 'display notification "no URL passed to handler" with title "cosmos-mcp"'
  exit 1
fi

# Extract the key= param. Tolerant of either query (?) or fragment (#) form.
KEY=$(printf '%s' "$URL" | /usr/bin/sed -n 's/.*[?&#]key=\\([^&]*\\).*/\\1/p' | /usr/bin/sed 's/%2B/+/g; s/%2F/\\//g; s/%3D/=/g')

if [ -z "$KEY" ]; then
  /usr/bin/osascript -e 'display notification "no key in URL" with title "cosmos-mcp"'
  exit 1
fi

# Find npx. Prefer the user's PATH, then common Homebrew / nvm install paths.
NPX=""
for cand in /usr/local/bin/npx /opt/homebrew/bin/npx "$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin/npx" "$(command -v npx 2>/dev/null)"; do
  if [ -x "$cand" ]; then NPX="$cand"; break; fi
done

if [ -z "$NPX" ]; then
  /usr/bin/osascript -e 'display notification "npx not found. install node from nodejs.org" with title "cosmos-mcp"'
  exit 1
fi

OUTPUT=$("$NPX" -y @polarity-lab/cosmos-mcp provision "$KEY" 2>&1)
STATUS=$?

if [ $STATUS -eq 0 ]; then
  /usr/bin/osascript -e 'display notification "key provisioned. you can close the browser." with title "cosmos-mcp"'
else
  MSG=$(printf '%s' "$OUTPUT" | /usr/bin/head -c 200 | /usr/bin/tr '\\n' ' ')
  /usr/bin/osascript -e "display notification \\"$MSG\\" with title \\"cosmos-mcp\\""
  exit $STATUS
fi
`;

  try {
    writeFileSync(infoPlistPath, infoPlist);
    writeFileSync(execPath, handlerScript);
    chmodSync(execPath, 0o755);
  } catch (e) {
    process.stderr.write(`could not write handler app. ${(e && e.message) || e}\n`);
    return 1;
  }

  // Register the URL scheme with Launch Services. lsregister is buried.
  const lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  try {
    spawnSync(lsregister, ["-f", appDir], { stdio: "ignore" });
  } catch {
    // non-fatal. The bundle exists; double-clicking it once also registers it.
  }

  process.stdout.write(`handler installed at ${appDir}\n`);
  process.stdout.write("tap a cosmos-mcp:// link to test.\n");
  return 0;
}

// ----- daemon ----------------------------------------------------------------
// Background sync. `cosmos-mcp daemon install` drops a LaunchAgent plist that
// runs `cosmos-mcp browser sync && cosmos-mcp imessage sync && cosmos-mcp
// calendar sync` every 4 hours (and once on login). Logs go to
// ~/Library/Logs/cosmos-mcp/. The runner script is generated fresh on each
// install so it always points at the npx invocation; the plist points at
// the runner script, not at npx directly, so the user can read what is
// being run and so we can extend it later without bumping the agent label.

async function runDaemon(sub, _rest) {
  const DAEMON_LABEL = "com.polaritylab.cosmos-mcp.sync";
  const DAEMON_INTERVAL_SECONDS = 4 * 60 * 60; // 4h
  if (platform() !== "darwin") {
    process.stderr.write(
      "daemon is macOS-only (it uses launchd). on other platforms, schedule\n" +
        "  npx -y @polarity-lab/cosmos-mcp browser sync\n" +
        "  npx -y @polarity-lab/cosmos-mcp imessage sync\n" +
        "  npx -y @polarity-lab/cosmos-mcp calendar sync\n" +
        "via cron or systemd-timer instead.\n",
    );
    return 1;
  }

  const action = (sub || "install").trim();
  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(agentsDir, `${DAEMON_LABEL}.plist`);
  const runnerDir = join(homedir(), "Library", "Application Support", "cosmos-mcp");
  const runnerPath = join(runnerDir, "daemon-run.sh");
  const logDir = join(homedir(), "Library", "Logs", "cosmos-mcp");
  const logPath = join(logDir, "daemon.log");
  const errPath = join(logDir, "daemon.err.log");

  // The signed + notarized .app bundle that launchd actually fires.
  // Shipped inside the npm package at dist/CosmosSync.app/, copied into
  // ~/Applications on `install` so the user has a stable target to add
  // to Full Disk Access in System Settings.
  const userAppsDir = join(homedir(), "Applications");
  const installedAppPath = join(userAppsDir, "Cosmos Sync.app");
  const installedAppExec = join(installedAppPath, "Contents", "MacOS", "cosmos-sync");
  const packagedAppPath = join(PACKAGE_ROOT, "dist", "CosmosSync.app");

  if (action === "kick") {
    let uid = "";
    try { uid = execFileSync("/usr/bin/id", ["-u"], { encoding: "utf8" }).trim(); } catch { /* skip */ }
    if (!uid) {
      process.stderr.write("could not resolve uid; cannot kickstart.\n");
      return 1;
    }
    const r = spawnSync(
      "/bin/launchctl",
      ["kickstart", "-k", `gui/${uid}/${DAEMON_LABEL}`],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      process.stderr.write(`launchctl kickstart failed: ${(r.stderr || "").trim()}\n`);
      return 1;
    }
    process.stdout.write(`kicked ${DAEMON_LABEL}. tail -f "${logPath}" to watch.\n`);
    return 0;
  }

  if (action === "status") {
    const installed = existsSync(plistPath);
    process.stdout.write(`plist: ${installed ? plistPath : "(not installed)"}\n`);
    if (installed) {
      process.stdout.write(`runner: ${existsSync(runnerPath) ? runnerPath : "(missing!)"}\n`);
      process.stdout.write(`app:    ${existsSync(installedAppPath) ? installedAppPath : "(missing!)"}\n`);
      process.stdout.write(`log:    ${logPath}\n`);
      process.stdout.write(`err:    ${errPath}\n`);
      // Report code signing team id so the user can verify they're running
      // the signed build (and not a stale unsigned dev copy).
      if (existsSync(installedAppPath)) {
        const cs = spawnSync(
          "/usr/bin/codesign",
          ["-dv", installedAppPath],
          { encoding: "utf8" },
        );
        const csOut = `${cs.stdout || ""}${cs.stderr || ""}`;
        const teamLine = csOut.split("\n").find((l) => l.includes("TeamIdentifier"));
        process.stdout.write(`signed: ${teamLine ? teamLine.trim() : "(no signature)"}\n`);
      }
      // launchctl list filters by label substring; grep the label.
      const r = spawnSync("/bin/launchctl", ["list", DAEMON_LABEL], { encoding: "utf8" });
      if (r.status === 0) {
        process.stdout.write(`loaded: yes\n${r.stdout}`);
      } else {
        process.stdout.write("loaded: no (run `cosmos-mcp daemon install` to load)\n");
      }
    }
    return 0;
  }

  if (action === "uninstall") {
    // unload first; ignore "not loaded" errors.
    spawnSync("/bin/launchctl", ["unload", plistPath], { stdio: "ignore" });
    try {
      if (existsSync(plistPath)) {
        // best-effort remove
        execFileSync("/bin/rm", ["-f", plistPath], { stdio: "ignore" });
      }
      if (existsSync(runnerPath)) {
        execFileSync("/bin/rm", ["-f", runnerPath], { stdio: "ignore" });
      }
      if (existsSync(installedAppPath)) {
        execFileSync("/bin/rm", ["-rf", installedAppPath], { stdio: "ignore" });
      }
    } catch {
      /* non-fatal */
    }
    process.stdout.write(`uninstalled ${DAEMON_LABEL}\n`);
    process.stdout.write(
      "remove the FDA grant manually in System Settings → Privacy & Security → Full Disk Access if you want.\n",
    );
    return 0;
  }

  if (action !== "install") {
    process.stderr.write("usage: cosmos-mcp daemon <install|uninstall|status|kick>\n");
    return 1;
  }

  // Verify the shipped .app exists in the package. Built by
  // scripts/build-daemon-app.sh and committed into dist/ before publish.
  if (!existsSync(packagedAppPath)) {
    process.stderr.write(
      `cosmos sync .app missing from this install at:\n  ${packagedAppPath}\n` +
        "you are likely running a local dev checkout without a built bundle.\n" +
        "build it with: bash scripts/build-daemon-app.sh\n",
    );
    return 1;
  }

  // Copy the .app into ~/Applications. We use cp -R so the bundle's bit-
  // for-bit signature stays intact (rsync's default mode rewrites metadata
  // and breaks the codesign seal). Replace any existing copy.
  try {
    mkdirSync(userAppsDir, { recursive: true });
    if (existsSync(installedAppPath)) {
      execFileSync("/bin/rm", ["-rf", installedAppPath], { stdio: "ignore" });
    }
    execFileSync("/bin/cp", ["-R", packagedAppPath, installedAppPath], { stdio: "ignore" });
    // npm sometimes strips the executable bit on nested binaries inside
    // tarballs. Re-assert it so launchd can fire the bundle.
    if (existsSync(installedAppExec)) {
      chmodSync(installedAppExec, 0o755);
    }
  } catch (e) {
    process.stderr.write(`could not stage Cosmos Sync.app. ${(e && e.message) || e}\n`);
    return 1;
  }

  // Register the bundle with Launch Services so its TCC identity is known
  // before launchd fires it. lsregister is buried but stable.
  const lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  spawnSync(lsregister, ["-f", installedAppPath], { stdio: "ignore" });

  // Resolve npx so the runner script does not depend on the user's PATH at
  // launchd-fire time. launchd inherits a sparse env; not all users have
  // node on the default launchd PATH. Falls back to a search.
  const npxCandidates = [
    "/opt/homebrew/bin/npx",
    "/usr/local/bin/npx",
  ];
  const homeNvm = join(homedir(), ".nvm", "versions", "node");
  if (existsSync(homeNvm)) {
    try {
      const versions = execFileSync("/bin/ls", [homeNvm], { encoding: "utf8" })
        .split("\n").filter(Boolean).sort();
      const newest = versions[versions.length - 1];
      if (newest) npxCandidates.push(join(homeNvm, newest, "bin", "npx"));
    } catch {
      /* skip */
    }
  }
  const npxPath = npxCandidates.find((p) => existsSync(p)) || "/usr/local/bin/npx";

  // The runner. Each source runs sequentially; failures are logged but do
  // not abort the next source. `imessage probe` first so a missing chat.db
  // / Full Disk Access yields a clear log line instead of a crash.
  const runner = `#!/bin/bash
# cosmos-mcp daemon runner. Invoked by launchd every ${Math.round(DAEMON_INTERVAL_SECONDS / 60)} minutes.
# Each source is best-effort; one failing source does not block the others.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ts() { /bin/date "+%Y-%m-%dT%H:%M:%S%z"; }

echo "[$(ts)] daemon tick start"

# iMessage. The probe is informational; do not gate the sync on it.
"${npxPath}" -y @polarity-lab/cosmos-mcp imessage sync 2>&1 \\
  | /usr/bin/sed "s/^/[imessage] /"
IMESSAGE_STATUS=\${PIPESTATUS[0]}
echo "[$(ts)] imessage exit=$IMESSAGE_STATUS"

# Browser history.
"${npxPath}" -y @polarity-lab/cosmos-mcp browser sync 2>&1 \\
  | /usr/bin/sed "s/^/[browser] /"
BROWSER_STATUS=\${PIPESTATUS[0]}
echo "[$(ts)] browser exit=$BROWSER_STATUS"

# Calendar.
"${npxPath}" -y @polarity-lab/cosmos-mcp calendar sync 2>&1 \\
  | /usr/bin/sed "s/^/[calendar] /"
CALENDAR_STATUS=\${PIPESTATUS[0]}
echo "[$(ts)] calendar exit=$CALENDAR_STATUS"

echo "[$(ts)] daemon tick done"
`;

  // The plist. KeepAlive=false means a single run per StartInterval. RunAtLoad
  // gives a sync within seconds of `launchctl load` so the user does not wait
  // 4h to see the first run.
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${installedAppExec}</string>
  </array>
  <key>StartInterval</key>
  <integer>${DAEMON_INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${errPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;

  try {
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(runnerDir, { recursive: true });
    mkdirSync(logDir, { recursive: true });
    writeFileSync(runnerPath, runner);
    chmodSync(runnerPath, 0o755);
    writeFileSync(plistPath, plist);
  } catch (e) {
    process.stderr.write(`could not write daemon files. ${(e && e.message) || e}\n`);
    return 1;
  }

  // Reload: unload first (ignore "not loaded") so a re-install picks up
  // edits to runner/plist. Then load. Then `kickstart` to fire one tick
  // immediately and surface any error inline.
  spawnSync("/bin/launchctl", ["unload", plistPath], { stdio: "ignore" });
  const loadRes = spawnSync("/bin/launchctl", ["load", plistPath], { encoding: "utf8" });
  if (loadRes.status !== 0) {
    process.stderr.write(`launchctl load failed: ${(loadRes.stderr || "").trim()}\n`);
    return 1;
  }
  // `kickstart` forces an immediate run regardless of StartInterval.
  // `gui/<uid>/<label>` is the modern domain target.
  let uid = "";
  try { uid = execFileSync("/usr/bin/id", ["-u"], { encoding: "utf8" }).trim(); } catch { /* skip */ }
  if (uid) {
    spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${DAEMON_LABEL}`], { stdio: "ignore" });
  }

  process.stdout.write("cosmos sync daemon installed.\n\n");
  process.stdout.write("one manual step on macOS to enable iMessage + calendar:\n");
  process.stdout.write("  1. open System Settings → Privacy & Security → Full Disk Access\n");
  process.stdout.write("  2. click +, then drag \"~/Applications/Cosmos Sync.app\" into the list\n");
  process.stdout.write("  3. make sure the checkbox next to it is on\n");
  process.stdout.write("  4. run: cosmos-mcp daemon kick\n\n");
  process.stdout.write("browser sync already works without that step. logs:\n");
  process.stdout.write(`  tail -f "${logPath}"\n`);
  return 0;
}

// ----- imessage probe --------------------------------------------------------

async function runImessageProbe() {
  if (platform() !== "darwin") {
    process.stderr.write("imessage probe is macOS-only.\n");
    return 1;
  }
  resolveKeyIntoEnv();
  if (!(process.env.COSMOS_TOKEN || "").trim()) {
    process.stderr.write(
      "no cosmos key configured. run: cosmos-mcp provision pmk_xxx " +
        "(get a key from cosmos.polarity-lab.com/connectors)\n",
    );
    return 1;
  }

  const chatDb = join(homedir(), "Library", "Messages", "chat.db");
  if (!existsSync(chatDb)) {
    process.stderr.write(
      "no chat.db found at ~/Library/Messages/chat.db. is iMessage signed in on this Mac?\n",
    );
    return 1;
  }

  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (e) {
    process.stderr.write(
      `could not load better-sqlite3. ${(e && e.message) || e}\nrun: npm install -g @polarity-lab/cosmos-mcp\n`,
    );
    return 1;
  }

  let db;
  try {
    db = new Database(chatDb, { readonly: true, fileMustExist: true });
    // message.date is 64-bit ns; opt into BigInt so we don't lose precision.
    db.defaultSafeIntegers(true);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/EACCES|authorization denied|operation not permitted/i.test(msg)) {
      process.stderr.write(
        "full disk access is not granted. open System Settings, Privacy & Security, Full Disk Access. add Terminal (or your runner). then re-run.\n",
      );
      return 1;
    }
    process.stderr.write(`could not open chat.db. ${msg}\n`);
    return 1;
  }

  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM chat").get();
    const count = Number((row && row.n) || 0n);
    const latest = db.prepare("SELECT MAX(date) AS d FROM message").get();
    let latestIso = null;
    if (latest && latest.d && latest.d > 0n) {
      // Apple stores message.date as nanoseconds since 2001-01-01T00:00:00Z.
      const APPLE_EPOCH_OFFSET_MS = 978307200n * 1000n;
      const ms = latest.d / 1_000_000n + APPLE_EPOCH_OFFSET_MS;
      latestIso = new Date(Number(ms)).toISOString();
    }
    process.stdout.write(
      `iMessage access ok. ${count} chats available` +
        (latestIso ? `, latest message ${latestIso}` : "") +
        ".\n",
    );
    return 0;
  } catch (e) {
    process.stderr.write(`probe query failed. ${(e && e.message) || e}\n`);
    return 1;
  } finally {
    try { db.close(); } catch {}
  }
}

// Exported only for tests. ESM modules don't expose locals by default, so the
// helpers above are re-exported on a sentinel symbol when run under vitest.
// This is a no-op at runtime; tests import from the source file directly.
export { resolveKey };
