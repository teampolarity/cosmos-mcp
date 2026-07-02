// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/daemon/menu-cli.js
// `cosmos-mcp menu install|uninstall|open` — menu bar app login item.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installDaemon } from "./manage.js";
import { daemonPaths, packagedAppPath } from "./paths.js";
import { loadSyncConfig } from "./config.js";
const MENU_LABEL = "com.polaritylab.cosmos-mcp.menu";
function packageRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
function menuPlistPath() {
    return join(homedir(), "Library", "LaunchAgents", `${MENU_LABEL}.plist`);
}
function menuExecPath() {
    return daemonPaths().installedMenuExec;
}
function stageAppIfNeeded(root) {
    const paths = daemonPaths();
    const bundle = packagedAppPath(root);
    if (!existsSync(bundle)) {
        return { ok: false, error: "Cosmos.app missing from npm package" };
    }
    try {
        mkdirSync(paths.userAppsDir, { recursive: true });
        if (existsSync(paths.installedAppPath)) {
            execFileSync("/bin/rm", ["-rf", paths.installedAppPath], { stdio: "ignore" });
        }
        execFileSync("/bin/cp", ["-R", bundle, paths.installedAppPath], { stdio: "ignore" });
        const menuExec = menuExecPath();
        const daemonExec = paths.installedDaemonExec;
        if (existsSync(menuExec))
            chmodSync(menuExec, 0o755);
        if (existsSync(daemonExec))
            chmodSync(daemonExec, 0o755);
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
    const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
    spawnSync(lsregister, ["-f", paths.installedAppPath], { stdio: "ignore" });
    return { ok: true };
}
export async function runMenuCli(sub) {
    if (platform() !== "darwin") {
        process.stderr.write("menu bar is macOS-only.\n");
        return 1;
    }
    const action = (sub || "install").trim();
    const root = packageRoot();
    const paths = daemonPaths();
    if (action === "open") {
        if (!existsSync(menuExecPath())) {
            const staged = stageAppIfNeeded(root);
            if (!staged.ok) {
                process.stderr.write(`${staged.error}\n`);
                return 1;
            }
        }
        const child = spawn("/usr/bin/open", ["-a", paths.installedAppPath], { detached: true, stdio: "ignore" });
        child.unref();
        return 0;
    }
    if (action === "uninstall") {
        spawnSync("/bin/launchctl", ["unload", menuPlistPath()], { stdio: "ignore" });
        try {
            if (existsSync(menuPlistPath()))
                execFileSync("/bin/rm", ["-f", menuPlistPath()], { stdio: "ignore" });
        }
        catch { /* ignore */ }
        process.stdout.write("menu bar login item removed.\n");
        return 0;
    }
    if (action !== "install") {
        process.stderr.write("usage: cosmos-mcp menu <install|uninstall|open>\n");
        return 1;
    }
    const staged = stageAppIfNeeded(root);
    if (!staged.ok) {
        process.stderr.write(`${staged.error}\n`);
        return 1;
    }
    if (!existsSync(menuExecPath())) {
        process.stderr.write(`menu executable missing at ${menuExecPath()}\n`);
        return 1;
    }
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${MENU_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>${paths.installedAppPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
    try {
        mkdirSync(paths.agentsDir, { recursive: true });
        writeFileSync(menuPlistPath(), plist);
    }
    catch (e) {
        process.stderr.write(`could not write menu plist: ${e.message}\n`);
        return 1;
    }
    spawnSync("/bin/launchctl", ["unload", menuPlistPath()], { stdio: "ignore" });
    const load = spawnSync("/bin/launchctl", ["load", menuPlistPath()], { encoding: "utf8" });
    if (load.status !== 0) {
        process.stderr.write(`launchctl load failed: ${(load.stderr || "").trim()}\n`);
        return 1;
    }
    // Also ensure background sync daemon if user hasn't yet.
    if (!existsSync(paths.plistPath)) {
        const config = loadSyncConfig();
        installDaemon(root, config);
    }
    process.stdout.write("cosmos sync menu bar installed (starts at login).\n");
    process.stdout.write(`open ${paths.installedAppPath} or look for the ◎ icon in the menu bar.\n`);
    process.stdout.write("grant Full Disk Access to Cosmos.app for iMessage + calendar.\n");
    return 0;
}
