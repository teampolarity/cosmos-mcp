// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/cli.js
// `cosmos-mcp settings` — Cosmos Sync control panel (local UI).
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { PACKAGE_VERSION } from "../version.js";
import { startSettingsServer } from "./server.js";
import { clearSettingsServerState, isPidAlive, readSettingsServerState, stopSettingsServer, waitForSettingsServer, writeSettingsServerState, } from "./server-state.js";
function openBrowser(port) {
    if (platform() !== "darwin")
        return;
    try {
        execFileSync("open", [`http://127.0.0.1:${port}/`], { stdio: "ignore" });
    }
    catch { /* non-fatal */ }
}
function cosmosMcpBin() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "cosmos-mcp.js");
}
function isCurrentSettingsServer() {
    const existing = readSettingsServerState();
    return !!(existing &&
        isPidAlive(existing.pid) &&
        existing.package_version === PACKAGE_VERSION);
}
async function spawnDetachedSettingsServer() {
    const bin = cosmosMcpBin();
    if (!existsSync(bin)) {
        process.stderr.write("could not find cosmos-mcp.js for detached settings server.\n");
        return null;
    }
    const child = spawn(process.execPath, [bin, "settings", "--detach", "--no-open"], {
        detached: true,
        stdio: "ignore",
        env: process.env,
    });
    child.unref();
    return waitForSettingsServer();
}
export async function ensureFreshSettingsServer() {
    if (isCurrentSettingsServer()) {
        return readSettingsServerState();
    }
    stopSettingsServer();
    return spawnDetachedSettingsServer();
}
export async function openSettingsUi() {
    const state = await ensureFreshSettingsServer();
    if (!state) {
        process.stderr.write("settings server did not start. run: cosmos-mcp provision pmk_xxx\n");
        return 1;
    }
    openBrowser(state.port);
    process.stdout.write(`cosmos · settings · http://127.0.0.1:${state.port}/\n`);
    return 0;
}
export async function runSettingsCli(argv) {
    if (argv.includes("--stop")) {
        stopSettingsServer();
        process.stdout.write("cosmos · settings server stopped.\n");
        return 0;
    }
    if (argv[0] === "open" || argv.includes("open")) {
        return openSettingsUi();
    }
    const detach = argv.includes("--detach");
    const noOpen = argv.includes("--no-open");
    const fresh = argv.includes("--fresh");
    const apiBase = process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";
    const token = (process.env.COSMOS_TOKEN || "").trim();
    if (!token) {
        process.stderr.write("no cosmos key configured. run: cosmos-mcp provision pmk_xxx\n" +
            "(get a key from cosmos.polarity-lab.com/connectors)\n");
        return 1;
    }
    if (fresh) {
        stopSettingsServer();
    }
    else if (isCurrentSettingsServer()) {
        const existing = readSettingsServerState();
        if (existing) {
            process.stdout.write(`cosmos · settings · http://127.0.0.1:${existing.port}/\n`);
            return 0;
        }
    }
    const { port, close } = await startSettingsServer({
        apiBase,
        token,
        openBrowser: !noOpen && !detach,
    });
    writeSettingsServerState({
        port,
        pid: process.pid,
        started_at: new Date().toISOString(),
        package_version: PACKAGE_VERSION,
    });
    if (detach) {
        process.stdout.write(`cosmos · settings · http://127.0.0.1:${port}/\n`);
        process.on("SIGTERM", () => {
            clearSettingsServerState();
            close();
            process.exit(0);
        });
        await new Promise(() => { });
        return 0;
    }
    process.stdout.write(`cosmos · settings · http://127.0.0.1:${port}/\n`);
    process.stdout.write("leave this running; press Ctrl+C to stop.\n");
    await new Promise((resolve) => {
        const onSignal = () => {
            clearSettingsServerState();
            close();
            resolve();
        };
        process.on("SIGINT", onSignal);
        process.on("SIGTERM", onSignal);
    });
    return 0;
}
