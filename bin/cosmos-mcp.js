#!/usr/bin/env node
// cosmos-mcp CLI entrypoint.
//
// Routes top-level subcommands to compiled `dist/` modules. The provision /
// install-handler / imessage probe paths live inline here, both because they
// are tiny and because they must not depend on the rest of the build being
// present (e.g. `npx -y @polarity-lab/cosmos-mcp provision pmk_xxx` on a fresh
// install should not fail because better-sqlite3 hasn't been gyp-rebuilt yet).

import { execFile, execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

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
const NO_KEY_SUBS = new Set(["provision", "install-handler", "daemon", "menu", "update", "--help", "-h", "help", "--version", "-v"]);

if (maybeSub === "provision") {
  process.exit(await runProvision(maybeSubSub, rest));
} else if (maybeSub === "install-handler") {
  process.exit(await runInstallHandler());
} else if (maybeSub === "daemon") {
  const { runDaemonCli } = await import("../dist/daemon/cli.js");
  process.exit(await runDaemonCli(maybeSubSub, rest));
} else if (maybeSub === "update") {
  const { runUpdateCli } = await import("../dist/update/cli.js");
  process.exit(await runUpdateCli([maybeSubSub, ...rest].filter(Boolean)));
} else if (maybeSub === "menu") {
  const { runMenuCli } = await import("../dist/daemon/menu-cli.js");
  process.exit(await runMenuCli(maybeSubSub));
} else if (maybeSub === "settings") {
  await ensureKeyOrExit("settings");
  const { runSettingsCli } = await import("../dist/settings/cli.js");
  process.exit(await runSettingsCli([maybeSubSub, ...rest].filter(Boolean)));
} else if (maybeSub === "imessage" && maybeSubSub === "probe") {
  ensureSqliteNativeOrReexec("imessage");
  process.exit(await runImessageProbe(rest));
} else if (maybeSub === "imessage" && maybeSubSub === "caption") {
  await ensureKeyOrExit(maybeSub);
  const { runCaptionCli } = await import("../dist/sources/imessage/caption.js");
  const code = await runCaptionCli(rest);
  process.exit(code);
} else if (maybeSub === "imessage") {
  ensureSqliteNativeOrReexec("imessage");
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
  ensureSqliteNativeOrReexec("calendar");
  await ensureKeyOrExit(maybeSub);
  const { runCalendarCli } = await import("../dist/sources/calendar/cli.js");
  const code = await runCalendarCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "claude-desktop") {
  await ensureKeyOrExit(maybeSub);
  const { runClaudeDesktopCli } = await import("../dist/sources/claude-desktop/cli.js");
  const code = await runClaudeDesktopCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "shell-history") {
  await ensureKeyOrExit(maybeSub);
  const { runShellHistoryCli } = await import("../dist/sources/shell-history/cli.js");
  const code = await runShellHistoryCli([maybeSubSub, ...rest].filter(Boolean));
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

// better-sqlite3 is a native addon. macOS often has two Node installs (Apple
// /usr/bin vs Homebrew /opt/homebrew). If the addon was built for one and the
// user runs the other, re-exec via Homebrew node once before failing.
function ensureSqliteNativeOrReexec(sub) {
  if (platform() !== "darwin") return;
  if (!["imessage", "calendar"].includes(sub)) return;
  if (process.env.COSMOS_MCP_NODE_REEXEC === "1") return;

  const loadSqlite = () => {
    require("better-sqlite3");
  };

  try {
    loadSqlite();
    return;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (!/NODE_MODULE_VERSION|was compiled against a different Node/i.test(msg)) {
      throw e;
    }
  }

  // Rebuild native module for the Node that's actually running (common after npx
  // cache was populated by a different Node major).
  const npmBin = join(dirname(process.execPath), "npm");
  const rebuildCmd = existsSync(npmBin) ? npmBin : "npm";
  spawnSync(rebuildCmd, ["rebuild", "better-sqlite3"], {
    cwd: PACKAGE_ROOT,
    stdio: "ignore",
    env: process.env,
  });
  try {
    loadSqlite();
    return;
  } catch {
    /* fall through to re-exec */
  }

  const candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node"];
  const node = candidates.find((p) => existsSync(p) && p !== process.execPath);
  if (!node) {
    process.stderr.write(
      "better-sqlite3 was built for a different Node.js than the one running.\n\n" +
        "fix: rm -rf ~/.npm/_npx/* && npx -y @polarity-lab/cosmos-mcp imessage sync\n\n" +
        "or: cd $(npm root -g)/@polarity-lab/cosmos-mcp && npm rebuild better-sqlite3\n",
    );
    process.exit(1);
  }
  const r = spawnSync(node, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, COSMOS_MCP_NODE_REEXEC: "1" },
  });
  process.exit(typeof r.status === "number" ? r.status : 1);
}

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

// ----- imessage probe --------------------------------------------------------

async function runImessageProbe(extraArgs = []) {
  const jsonOut = extraArgs.includes("--json");

  function emit(ok, payload) {
    if (jsonOut) {
      process.stdout.write(JSON.stringify({ ok, ...payload }) + "\n");
      return;
    }
    if (ok) {
      const chats = payload.chat_count ?? 0;
      const latest = payload.latest_message;
      process.stdout.write(
        `iMessage access ok. ${chats} chats available` +
          (latest ? `, latest message ${latest}` : "") +
          ".\n",
      );
      return;
    }
    process.stderr.write((payload.error || "probe failed") + "\n");
  }

  if (platform() !== "darwin") {
    emit(false, { error: "imessage probe is macOS-only." });
    return 1;
  }
  resolveKeyIntoEnv();
  if (!(process.env.COSMOS_TOKEN || "").trim()) {
    emit(false, {
      error:
        "no cosmos key configured. run: cosmos-mcp provision pmk_xxx " +
        "(get a key from cosmos.polarity-lab.com/connectors)",
    });
    return 1;
  }

  const chatDb = join(homedir(), "Library", "Messages", "chat.db");
  if (!existsSync(chatDb)) {
    emit(false, { error: "no chat.db found at ~/Library/Messages/chat.db. is iMessage signed in on this Mac?" });
    return 1;
  }

  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (e) {
    emit(false, {
      error: `could not load better-sqlite3. ${(e && e.message) || e}\nrun: npm install -g @polarity-lab/cosmos-mcp`,
    });
    return 1;
  }

  let db;
  try {
    db = new Database(chatDb, { readonly: true, fileMustExist: true });
    db.defaultSafeIntegers(true);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/EACCES|authorization denied|operation not permitted|unable to open database/i.test(msg)) {
      emit(false, {
        error:
          "full disk access is not granted. open System Settings → Privacy & Security → Full Disk Access, " +
          "add Cosmos Sync.app, then test again.",
      });
      return 1;
    }
    emit(false, { error: `could not open chat.db. ${msg}` });
    return 1;
  }

  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM chat").get();
    const count = Number((row && row.n) || 0n);
    const latest = db.prepare("SELECT MAX(date) AS d FROM message").get();
    let latestIso = null;
    if (latest && latest.d && latest.d > 0n) {
      const APPLE_EPOCH_OFFSET_MS = 978307200n * 1000n;
      const ms = latest.d / 1_000_000n + APPLE_EPOCH_OFFSET_MS;
      latestIso = new Date(Number(ms)).toISOString();
    }
    emit(true, { chat_count: count, latest_message: latestIso });
    return 0;
  } catch (e) {
    emit(false, { error: `probe query failed. ${(e && e.message) || e}` });
    return 1;
  } finally {
    try { db.close(); } catch {}
  }
}

// Exported only for tests. ESM modules don't expose locals by default, so the
// helpers above are re-exported on a sentinel symbol when run under vitest.
// This is a no-op at runtime; tests import from the source file directly.
export { resolveKey };
