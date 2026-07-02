// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/daemon/manage.js
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { intervalSeconds, loadSyncConfig, saveSyncConfig, } from "./config.js";
import { DAEMON_LABEL, daemonPaths, packagedAppPath, resolveNpxPath } from "./paths.js";
function buildRunner(npxPath, config) {
    const mins = Math.round(intervalSeconds(config.interval_hours) / 60);
    const blocks = [
        "#!/bin/bash",
        `# cosmos-mcp daemon runner. Invoked by launchd every ${mins} minutes.`,
        "set -u",
        'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"',
        "",
        'ts() { /bin/date "+%Y-%m-%dT%H:%M:%S%z"; }',
        "",
        'echo "[$(ts)] daemon tick start"',
        "",
    ];
    const sources = [
        { key: "imessage", label: "imessage", cmd: "imessage sync" },
        { key: "browser", label: "browser", cmd: "browser sync" },
        { key: "calendar", label: "calendar", cmd: "calendar sync" },
        { key: "claude_desktop", label: "claude-desktop", cmd: "claude-desktop sync" },
        { key: "shell_history", label: "shell-history", cmd: "shell-history sync" },
    ];
    const statusVars = [];
    for (const s of sources) {
        if (!config.sources[s.key])
            continue;
        const shellVar = s.label.toUpperCase().replace(/-/g, "_") + "_EXIT";
        const jsonKey = s.label.replace(/-/g, "_") + "_exit";
        statusVars.push({ shell: shellVar, json: jsonKey });
        blocks.push(`# ${s.label}`, `"${npxPath}" -y @polarity-lab/cosmos-mcp ${s.cmd} 2>&1 \\`, `  | /usr/bin/sed "s/^/[${s.label}] /"`, `${shellVar}=\${PIPESTATUS[0]}`, `echo "[$(ts)] ${s.label} exit=$${shellVar}"`, "");
    }
    blocks.push('echo "[$(ts)] daemon tick done"', "");
    if (statusVars.length) {
        const jsonBody = statusVars.map((v) => `"${v.json}":$${v.shell}`).join(",");
        blocks.push(`/bin/mkdir -p "$HOME/.cosmos"`, `FINISHED_AT="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"`, `/usr/bin/printf '{"finished_at":"%s",${jsonBody}}\\n' "$FINISHED_AT" > "$HOME/.cosmos/daemon-status.json"`, "");
    }
    return blocks.join("\n");
}
function buildPlist(installedAppExec, intervalSec, logPath, errPath) {
    return `<?xml version="1.0" encoding="UTF-8"?>
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
  <integer>${intervalSec}</integer>
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
}
export function getDaemonStatus(lastImessageSyncAt = null) {
    const paths = daemonPaths();
    const config = loadSyncConfig();
    let loaded = false;
    if (existsSync(paths.plistPath)) {
        const r = spawnSync("/bin/launchctl", ["list", DAEMON_LABEL], { encoding: "utf8" });
        loaded = r.status === 0;
    }
    return {
        platform: platform(),
        installed: existsSync(paths.plistPath),
        loaded,
        plist_path: existsSync(paths.plistPath) ? paths.plistPath : null,
        app_path: existsSync(paths.installedAppPath) ? paths.installedAppPath : null,
        log_path: paths.logPath,
        config,
        last_imessage_sync_at: lastImessageSyncAt,
    };
}
export function installDaemon(packageRoot, config) {
    if (platform() !== "darwin") {
        return { ok: false, error: "background sync is macOS-only" };
    }
    const cfg = config || loadSyncConfig();
    saveSyncConfig(cfg);
    const paths = daemonPaths();
    const appBundle = packagedAppPath(packageRoot);
    if (!existsSync(appBundle)) {
        return {
            ok: false,
            error: "Cosmos.app is missing from this install. Run from a published npm package.",
        };
    }
    try {
        mkdirSync(paths.userAppsDir, { recursive: true });
        if (existsSync(paths.installedAppPath)) {
            execFileSync("/bin/rm", ["-rf", paths.installedAppPath], { stdio: "ignore" });
        }
        execFileSync("/bin/cp", ["-R", appBundle, paths.installedAppPath], { stdio: "ignore" });
        if (existsSync(paths.installedDaemonExec)) {
            chmodSync(paths.installedDaemonExec, 0o755);
        }
        const menuExec = paths.installedMenuExec;
        if (existsSync(menuExec)) {
            chmodSync(menuExec, 0o755);
        }
    }
    catch (e) {
        return { ok: false, error: `could not stage Cosmos.app: ${e.message}` };
    }
    const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
    spawnSync(lsregister, ["-f", paths.installedAppPath], { stdio: "ignore" });
    const npxPath = resolveNpxPath();
    const runner = buildRunner(npxPath, cfg);
    const plist = buildPlist(paths.installedDaemonExec, intervalSeconds(cfg.interval_hours), paths.logPath, paths.errPath);
    try {
        mkdirSync(paths.agentsDir, { recursive: true });
        mkdirSync(paths.runnerDir, { recursive: true });
        mkdirSync(paths.logDir, { recursive: true });
        writeFileSync(paths.runnerPath, runner);
        chmodSync(paths.runnerPath, 0o755);
        writeFileSync(paths.plistPath, plist);
    }
    catch (e) {
        return { ok: false, error: `could not write daemon files: ${e.message}` };
    }
    spawnSync("/bin/launchctl", ["unload", paths.plistPath], { stdio: "ignore" });
    const loadRes = spawnSync("/bin/launchctl", ["load", paths.plistPath], { encoding: "utf8" });
    if (loadRes.status !== 0) {
        return { ok: false, error: `launchctl load failed: ${(loadRes.stderr || "").trim()}` };
    }
    let uid = "";
    try {
        uid = execFileSync("/usr/bin/id", ["-u"], { encoding: "utf8" }).trim();
    }
    catch { /* skip */ }
    if (uid) {
        spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${DAEMON_LABEL}`], { stdio: "ignore" });
    }
    return { ok: true };
}
export function uninstallDaemon() {
    if (platform() !== "darwin")
        return { ok: false, error: "macOS only" };
    const paths = daemonPaths();
    spawnSync("/bin/launchctl", ["unload", paths.plistPath], { stdio: "ignore" });
    try {
        if (existsSync(paths.plistPath))
            execFileSync("/bin/rm", ["-f", paths.plistPath], { stdio: "ignore" });
        if (existsSync(paths.runnerPath))
            execFileSync("/bin/rm", ["-f", paths.runnerPath], { stdio: "ignore" });
        if (existsSync(paths.installedAppPath))
            execFileSync("/bin/rm", ["-rf", paths.installedAppPath], { stdio: "ignore" });
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
    return { ok: true };
}
export function kickDaemon() {
    if (platform() !== "darwin")
        return { ok: false, error: "macOS only" };
    let uid = "";
    try {
        uid = execFileSync("/usr/bin/id", ["-u"], { encoding: "utf8" }).trim();
    }
    catch { /* skip */ }
    if (!uid)
        return { ok: false, error: "could not resolve uid" };
    const r = spawnSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${DAEMON_LABEL}`], { encoding: "utf8" });
    if (r.status !== 0) {
        return { ok: false, error: (r.stderr || "").trim() || "kickstart failed" };
    }
    return { ok: true };
}
export function applyDaemonConfig(packageRoot, config) {
    saveSyncConfig(config);
    const paths = daemonPaths();
    if (!existsSync(paths.plistPath))
        return { ok: true };
    return installDaemon(packageRoot, config);
}
