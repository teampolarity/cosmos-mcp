// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/sync-jobs.js
// Run cosmos-mcp sync subcommands for the settings UI.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpxPath } from "../daemon/paths.js";
import { recordBatchFinished } from "./sync-results.js";
const jobs = new Map();
let activeJob = null;
let jobCounter = 0;
function packageRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
export function resolveMcpInvocation() {
    const root = packageRoot();
    const localBin = join(root, "bin", "cosmos-mcp.js");
    if (existsSync(localBin)) {
        return { cmd: process.execPath, baseArgs: [localBin] };
    }
    return { cmd: resolveNpxPath(), baseArgs: ["-y", "@polarity-lab/cosmos-mcp"] };
}
function sourcesFor(source) {
    if (source === "all")
        return ["imessage"];
    return [source];
}
export function getJob(id) {
    return jobs.get(id);
}
export function listJobs() {
    return [...jobs.values()].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 10);
}
export function isSyncRunning() {
    return activeJob !== null;
}
export function beginSyncJob(source, token, onLine) {
    if (activeJob) {
        throw new Error("a sync is already running");
    }
    const id = `job-${++jobCounter}-${Date.now()}`;
    const job = {
        id,
        source,
        status: "running",
        lines: [],
        exit_code: null,
        started_at: new Date().toISOString(),
        finished_at: null,
    };
    jobs.set(id, job);
    const run = async () => {
        const { cmd, baseArgs } = resolveMcpInvocation();
        const env = { ...process.env, COSMOS_TOKEN: token };
        let lastExit = 0;
        const batch = [];
        for (const src of sourcesFor(source)) {
            const srcLines = [];
            job.lines.push(`— ${src} sync —`);
            onLine?.(id, `— ${src} sync —`);
            const exit = await new Promise((resolve) => {
                const args = [...baseArgs, src, "sync"];
                // Settings/menu sync: messages first; caption runs on background ticks (capped).
                if (src === "imessage")
                    args.push("--no-caption");
                const child = spawn(cmd, args, {
                    env,
                    stdio: ["ignore", "pipe", "pipe"],
                });
                const append = (chunk) => {
                    for (const line of chunk.toString().split("\n")) {
                        if (!line.trim())
                            continue;
                        job.lines.push(line);
                        srcLines.push(line);
                        onLine?.(id, line);
                        if (job.lines.length > 500)
                            job.lines.shift();
                    }
                };
                child.stdout?.on("data", append);
                child.stderr?.on("data", append);
                child.on("close", (code) => resolve(code ?? 1));
                child.on("error", () => resolve(1));
            });
            batch.push({ source: src, exit, lines: srcLines });
            lastExit = exit;
            if (exit !== 0 && source !== "all")
                break;
        }
        recordBatchFinished(source, batch);
        job.exit_code = lastExit;
        job.status = lastExit === 0 ? "done" : "failed";
        job.finished_at = new Date().toISOString();
        activeJob = null;
    };
    activeJob = run();
    return job;
}
