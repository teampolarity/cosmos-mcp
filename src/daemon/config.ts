// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/daemon/config.js
// ~/.cosmos/sync-config.json — background sync interval + source toggles.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
export const INTERVAL_HOURS_OPTIONS = [1, 2, 4, 8, 12, 24];
export const DEFAULT_SYNC_CONFIG = {
    interval_hours: 4,
    sources: {
        imessage: true,
        browser: false,
        calendar: false,
        claude_desktop: false,
        shell_history: false,
    },
};
/** Product surface is iMessage-only until other connectors ship in Sync. */
export function imessageOnlySources(sources) {
    return {
        imessage: sources.imessage !== false,
        browser: false,
        calendar: false,
        claude_desktop: false,
        shell_history: false,
    };
}
export function configPath() {
    return path.join(os.homedir(), ".cosmos", "sync-config.json");
}
export function loadSyncConfig() {
    const file = configPath();
    if (!fs.existsSync(file))
        return { ...DEFAULT_SYNC_CONFIG, sources: { ...DEFAULT_SYNC_CONFIG.sources } };
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        const hours = INTERVAL_HOURS_OPTIONS.includes(raw.interval_hours)
            ? raw.interval_hours
            : DEFAULT_SYNC_CONFIG.interval_hours;
        const sources = { ...DEFAULT_SYNC_CONFIG.sources, ...(raw.sources || {}) };
        return { interval_hours: hours, sources, auto_update: raw.auto_update === true };
    }
    catch {
        return { ...DEFAULT_SYNC_CONFIG, sources: { ...DEFAULT_SYNC_CONFIG.sources } };
    }
}
export function saveSyncConfig(config) {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
}
export function intervalSeconds(hours) {
    return hours * 60 * 60;
}
