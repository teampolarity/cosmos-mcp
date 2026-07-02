// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/update/cli.js
// `cosmos-mcp update check|install`
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadSyncConfig } from "../daemon/config.js";
import { resolveNpxPath } from "../daemon/paths.js";
import { PACKAGE_VERSION } from "../version.js";
import { checkForUpdate } from "./check.js";
import { clearUpdateProgress, writeUpdateProgress } from "./progress.js";
export function updateInfoPath() {
    return join(homedir(), ".cosmos", "update-available.json");
}
export function readCachedUpdateInfo() {
    const file = updateInfoPath();
    if (!existsSync(file))
        return null;
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        return null;
    }
}
export function writeCachedUpdateInfo(info) {
    mkdirSync(join(homedir(), ".cosmos"), { recursive: true });
    writeFileSync(updateInfoPath(), JSON.stringify(info, null, 2));
}
function clearNpxCache() {
    try {
        const npxRoot = join(homedir(), ".npm", "_npx");
        if (!existsSync(npxRoot))
            return;
        for (const entry of readdirSync(npxRoot)) {
            const pkg = join(npxRoot, entry, "node_modules", "@polarity-lab", "cosmos-mcp");
            if (existsSync(pkg))
                rmSync(join(npxRoot, entry), { recursive: true, force: true });
        }
    }
    catch { /* best-effort */ }
}
async function runUpdateInstall(latest, showProgress = false) {
    const npx = resolveNpxPath();
    const progress = (stage, percent, message) => {
        if (showProgress)
            writeUpdateProgress(stage, percent, message);
        process.stdout.write(`${message}\n`);
    };
    try {
        if (showProgress) {
            clearUpdateProgress();
            writeUpdateProgress("start", 0, "Starting…");
        }
        progress("start", 5, "Preparing update…");
        clearNpxCache();
        progress("cache", 15, "Cleared stale cache");
        progress("download", 50, `Downloading @polarity-lab/cosmos-mcp@${latest}…`);
        const warm = spawnSync(npx, ["-y", `@polarity-lab/cosmos-mcp@${latest}`, "--version"], {
            stdio: "pipe",
            env: process.env,
        });
        if (warm.status !== 0) {
            progress("error", 100, "Download failed");
            process.stderr.write("update download failed.\n");
            return 1;
        }
        progress("install", 85, "Installing Cosmos Sync.app…");
        const menu = spawnSync(npx, ["-y", `@polarity-lab/cosmos-mcp@${latest}`, "menu", "install"], { stdio: "pipe", env: process.env });
        if (menu.status !== 0) {
            progress("error", 100, "Menu install failed");
            process.stderr.write("menu reinstall failed.\n");
            return 1;
        }
        writeCachedUpdateInfo({
            current: latest,
            latest,
            update_available: false,
            checked_at: new Date().toISOString(),
        });
        progress("done", 100, `Updated to ${latest}`);
        process.stdout.write(`updated to ${latest}. quit and reopen Cosmos Sync if the menu looks stale.\n`);
        return 0;
    }
    finally {
        if (showProgress) {
            setTimeout(() => clearUpdateProgress(), 3000);
        }
    }
}
export async function runUpdateCli(argv) {
    const action = (argv[0] || "check").trim();
    if (action === "check") {
        const info = await checkForUpdate();
        writeCachedUpdateInfo(info);
        const config = loadSyncConfig();
        if (info.update_available && config.auto_update) {
            process.stdout.write(`auto-update: ${info.current} → ${info.latest}\n`);
            return runUpdateInstall(info.latest, argv.includes("--progress"));
        }
        if (argv.includes("--json")) {
            process.stdout.write(JSON.stringify(info, null, 2) + "\n");
            return 0;
        }
        if (info.update_available) {
            process.stdout.write(`update available: ${info.current} → ${info.latest}\n`);
            process.stdout.write("run: npx -y @polarity-lab/cosmos-mcp update install\n");
        }
        else {
            process.stdout.write(`cosmos-mcp ${PACKAGE_VERSION} is up to date.\n`);
        }
        return 0;
    }
    if (action === "install") {
        const info = await checkForUpdate();
        if (!info.update_available) {
            process.stdout.write(`already on latest (${PACKAGE_VERSION}).\n`);
            return 0;
        }
        return runUpdateInstall(info.latest, argv.includes("--progress"));
    }
    process.stderr.write("usage: cosmos-mcp update <check|install>\n");
    return 1;
}
