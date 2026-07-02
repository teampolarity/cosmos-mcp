// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/update/check.js
import { PACKAGE_VERSION } from "../version.js";
const REGISTRY_URL = "https://registry.npmjs.org/@polarity-lab/cosmos-mcp/latest";
export function parseVersion(v) {
    const parts = v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
export function isNewerVersion(latest, current) {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i])
            return true;
        if (a[i] < b[i])
            return false;
    }
    return false;
}
export async function fetchLatestVersion(fetchImpl = globalThis.fetch) {
    try {
        const res = await fetchImpl(REGISTRY_URL, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return typeof data.version === "string" ? data.version : null;
    }
    catch {
        return null;
    }
}
export async function checkForUpdate(fetchImpl = globalThis.fetch) {
    const latest = (await fetchLatestVersion(fetchImpl)) || PACKAGE_VERSION;
    return {
        current: PACKAGE_VERSION,
        latest,
        update_available: isNewerVersion(latest, PACKAGE_VERSION),
        checked_at: new Date().toISOString(),
    };
}
