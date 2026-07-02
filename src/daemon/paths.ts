// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/daemon/paths.js
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const DAEMON_LABEL = "com.polaritylab.cosmos-mcp.sync";
/** User-installed bundle names (new first, legacy fallback). */
export const INSTALLED_APP_NAMES = ["Cosmos.app", "Cosmos Sync.app"];
/** Bundled inside the npm package (new first, legacy fallback). */
export const PACKAGED_APP_NAMES = ["Cosmos.app", "CosmosSync.app"];
export function resolveInstalledAppPath(home = homedir()) {
    for (const name of INSTALLED_APP_NAMES) {
        const p = join(home, "Applications", name);
        if (existsSync(p))
            return p;
    }
    return join(home, "Applications", INSTALLED_APP_NAMES[0]);
}
export function packagedAppPath(packageRoot) {
    for (const name of PACKAGED_APP_NAMES) {
        const p = join(packageRoot, "dist", name);
        if (existsSync(p))
            return p;
    }
    return join(packageRoot, "dist", PACKAGED_APP_NAMES[0]);
}
export function daemonPaths() {
    const home = homedir();
    const installedAppPath = resolveInstalledAppPath(home);
    return {
        agentsDir: join(home, "Library", "LaunchAgents"),
        plistPath: join(home, "Library", "LaunchAgents", `${DAEMON_LABEL}.plist`),
        runnerDir: join(home, "Library", "Application Support", "cosmos-mcp"),
        runnerPath: join(home, "Library", "Application Support", "cosmos-mcp", "daemon-run.sh"),
        logDir: join(home, "Library", "Logs", "cosmos-mcp"),
        logPath: join(home, "Library", "Logs", "cosmos-mcp", "daemon.log"),
        errPath: join(home, "Library", "Logs", "cosmos-mcp", "daemon.err.log"),
        userAppsDir: join(home, "Applications"),
        installedAppPath,
        installedDaemonExec: join(installedAppPath, "Contents", "MacOS", "cosmos-sync-daemon"),
        installedMenuExec: join(installedAppPath, "Contents", "MacOS", "cosmos-sync"),
    };
}
/** @deprecated use installedDaemonExec */
export function legacyInstalledAppExec() {
    return daemonPaths().installedDaemonExec;
}
export function resolveNpxPath() {
    const candidates = ["/opt/homebrew/bin/npx", "/usr/local/bin/npx"];
    const homeNvm = join(homedir(), ".nvm", "versions", "node");
    if (existsSync(homeNvm)) {
        try {
            const versions = execFileSync("/bin/ls", [homeNvm], { encoding: "utf8" })
                .split("\n").filter(Boolean).sort();
            const newest = versions[versions.length - 1];
            if (newest)
                candidates.push(join(homeNvm, newest, "bin", "npx"));
        }
        catch { /* skip */ }
    }
    return candidates.find((p) => existsSync(p)) || "/usr/local/bin/npx";
}
