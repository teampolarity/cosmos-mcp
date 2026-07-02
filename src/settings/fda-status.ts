// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/fda-status.js
// ~/.cosmos/fda-status.json — written by Cosmos Sync.app (Swift FDA probe).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function fdaStatusPath() {
    return path.join(os.homedir(), ".cosmos", "fda-status.json");
}
export function loadFdaStatus() {
    const file = fdaStatusPath();
    if (!fs.existsSync(file))
        return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return null;
    }
}
