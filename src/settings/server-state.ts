// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/server-state.js
// Tracks the detached settings HTTP server (~/.cosmos/settings-server.json).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function statePath() {
    return path.join(os.homedir(), ".cosmos", "settings-server.json");
}
export function readSettingsServerState() {
    const file = statePath();
    if (!fs.existsSync(file))
        return null;
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof raw.port !== "number" || typeof raw.pid !== "number")
            return null;
        return raw;
    }
    catch {
        return null;
    }
}
export function writeSettingsServerState(state) {
    const file = statePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
}
export function clearSettingsServerState() {
    try {
        fs.unlinkSync(statePath());
    }
    catch { /* ignore */ }
}
export function isPidAlive(pid) {
    if (!pid || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function stopSettingsServer() {
    const existing = readSettingsServerState();
    if (existing && isPidAlive(existing.pid)) {
        try {
            process.kill(existing.pid, "SIGTERM");
        }
        catch { /* ignore */ }
    }
    clearSettingsServerState();
}
export async function waitForSettingsServer(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const state = readSettingsServerState();
        if (state && isPidAlive(state.pid))
            return state;
        await new Promise((r) => setTimeout(r, 200));
    }
    return readSettingsServerState();
}
