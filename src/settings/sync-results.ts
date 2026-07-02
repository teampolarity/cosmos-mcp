// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/sync-results.js
// ~/.cosmos/sync-results.json — last sync outcome per source (for Settings UI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function filePath() {
    return path.join(os.homedir(), ".cosmos", "sync-results.json");
}
export function loadSyncResults() {
    const empty = {
        last_run_at: null,
        last_run_source: null,
        last_run_status: null,
        sources: {},
    };
    if (!fs.existsSync(filePath()))
        return empty;
    try {
        return { ...empty, ...JSON.parse(fs.readFileSync(filePath(), "utf8")) };
    }
    catch {
        return empty;
    }
}
export function recordSourceResult(source, status, message) {
    const file = filePath();
    const data = loadSyncResults();
    data.sources[source] = {
        source,
        status,
        finished_at: new Date().toISOString(),
        message: message.slice(0, 400),
    };
    data.last_run_at = data.sources[source].finished_at;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
export function recordBatchFinished(source, results) {
    const file = filePath();
    const data = loadSyncResults();
    let anyFail = false;
    let anyOk = false;
    for (const r of results) {
        const tail = r.lines.filter(Boolean).slice(-3).join(" · ") || "(no output)";
        const status = r.exit !== 0 ? "failed" : /nothing to send|0 fresh turns|0 commands shipped|unchanged/i.test(tail)
            ? "empty"
            : "ok";
        if (status === "failed")
            anyFail = true;
        if (status === "ok")
            anyOk = true;
        data.sources[r.source] = {
            source: r.source,
            status,
            finished_at: new Date().toISOString(),
            message: status === "failed" ? tail : tail.slice(0, 400),
        };
    }
    data.last_run_at = new Date().toISOString();
    data.last_run_source = source;
    data.last_run_status = anyFail ? (anyOk ? "partial" : "failed") : "ok";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
