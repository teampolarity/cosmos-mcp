// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/update/progress.js
// ~/.cosmos/update-progress.json — live update install progress for the menu bar UI.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function progressPath() {
    return path.join(os.homedir(), ".cosmos", "update-progress.json");
}
export function writeUpdateProgress(stage, percent, message) {
    const file = progressPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = {
        stage,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        message,
        updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}
export function readUpdateProgress() {
    try {
        if (!fs.existsSync(progressPath()))
            return null;
        return JSON.parse(fs.readFileSync(progressPath(), "utf8"));
    }
    catch {
        return null;
    }
}
export function clearUpdateProgress() {
    try {
        fs.unlinkSync(progressPath());
    }
    catch { /* ignore */ }
}
