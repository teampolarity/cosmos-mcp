// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/server.js
// Cosmos Sync settings UI — sync control, daemon schedule, photo privacy.
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { INTERVAL_HOURS_OPTIONS, imessageOnlySources, } from "../daemon/config.js";
import { getDaemonStatus, installDaemon, kickDaemon, uninstallDaemon, } from "../daemon/manage.js";
import { loadContacts, normalizeEmail, normalizePhone } from "../sources/imessage/contacts.js";
import { defaultPath, loadState, saveState } from "../sources/imessage/state.js";
import { pushMediaRulesFromState, } from "../sources/imessage/media-prefs.js";
import { SETTINGS_HTML } from "./page.js";
import { loadFdaStatus } from "./fda-status.js";
import { loadSyncResults } from "./sync-results.js";
import { readCachedUpdateInfo, writeCachedUpdateInfo } from "../update/cli.js";
import { checkForUpdate } from "../update/check.js";
import { readUpdateProgress } from "../update/progress.js";
import { resolveMcpInvocation } from "./sync-jobs.js";
import { beginSyncJob, getJob, isSyncRunning, listJobs, } from "./sync-jobs.js";
const DEFAULT_API = process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";
const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;
const PREFS_TIMEOUT_MS = 2500;
const DEFAULT_MEDIA_PREFS = {
    propose_photos: false,
    caption_mode: "off",
    skip_kinds: ["sticker"],
    sender_rules: {},
    thread_rules: {},
};
function updateCacheFresh(info) {
    if (!info?.checked_at)
        return false;
    return Date.now() - new Date(info.checked_at).getTime() < UPDATE_CACHE_MS;
}
async function fetchMediaPrefsWithTimeout(apiBase, token, ms = PREFS_TIMEOUT_MS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    try {
        const res = await fetch(`${apiBase}/api/me/connectors/imessage/media`, {
            headers: { "X-MCP-Key": token },
            signal: ac.signal,
        });
        if (!res.ok)
            return DEFAULT_MEDIA_PREFS;
        return await res.json();
    }
    catch {
        return DEFAULT_MEDIA_PREFS;
    }
    finally {
        clearTimeout(timer);
    }
}
function refreshUpdateCacheInBackground() {
    if (updateCacheFresh(readCachedUpdateInfo()))
        return;
    void checkForUpdate()
        .then((info) => writeCachedUpdateInfo(info))
        .catch(() => { });
}
function packageRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
function resolveHandleName(handle, state, contacts) {
    const fromState = state.handles[handle]?.name?.trim();
    if (fromState)
        return fromState;
    if (contacts?.has(handle))
        return contacts.get(handle);
    const phone = normalizePhone(handle);
    if (phone && contacts?.has(phone))
        return contacts.get(phone);
    const email = normalizeEmail(handle);
    if (email && contacts?.has(email))
        return contacts.get(email);
    return handle;
}
function threadLabel(threadId, entry, state, contacts) {
    const names = (entry.participants || [])
        .filter((h) => h && h !== "self")
        .map((h) => resolveHandleName(h, state, contacts));
    if (names.length === 1)
        return names[0];
    if (names.length >= 2 && names.length <= 4)
        return names.join(", ");
    if (names.length > 4)
        return `${names[0]} + ${names.length - 1} more`;
    return `thread ${threadId.slice(0, 8)}`;
}
export function listThreadRows(state, contacts) {
    return Object.entries(state.threads || {})
        .map(([id, entry]) => ({
        id,
        label: threadLabel(id, entry, state, contacts),
        caption: entry.caption_images !== false,
        propose: entry.propose_photos !== false,
    }))
        .sort((a, b) => a.label.localeCompare(b.label));
}
function applyThreadRows(state, rows) {
    const next = { ...state, threads: { ...state.threads } };
    for (const row of rows) {
        const existing = next.threads[row.id] || { last_turn_id_synced: "", participants: [] };
        next.threads[row.id] = {
            ...existing,
            caption_images: row.caption ? undefined : false,
            propose_photos: row.propose ? undefined : false,
        };
    }
    return next;
}
function parseSyncConfig(body) {
    const hours = Number(body.interval_hours);
    if (!INTERVAL_HOURS_OPTIONS.includes(hours))
        return null;
    const raw = (body.sources || {});
    return {
        interval_hours: hours,
        sources: imessageOnlySources({
            imessage: raw.imessage !== false,
            browser: false,
            calendar: false,
            claude_desktop: false,
            shell_history: false,
        }),
        auto_update: body.auto_update === true,
    };
}
export async function startSettingsServer(opts) {
    const apiBase = opts.apiBase || DEFAULT_API;
    const statePath = defaultPath();
    const root = packageRoot();
    let activeJobId = null;
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || "/", `http://127.0.0.1`);
            if (url.pathname === "/" && req.method === "GET") {
                res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                });
                res.end(SETTINGS_HTML);
                return;
            }
            if (url.pathname === "/api/health" && req.method === "GET") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"ok":true}');
                return;
            }
            if (url.pathname === "/api/threads" && req.method === "GET") {
                const state = loadState(statePath);
                const contacts = loadContacts();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ threads: listThreadRows(state, contacts) }));
                return;
            }
            if (url.pathname === "/api/bootstrap" && req.method === "GET") {
                const state = loadState(statePath);
                refreshUpdateCacheInBackground();
                const prefs = await fetchMediaPrefsWithTimeout(apiBase, opts.token);
                const daemon = getDaemonStatus(state.last_sync_at);
                const running = isSyncRunning();
                const jobs = listJobs();
                const active = running ? jobs.find((j) => j.status === "running") : null;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    prefs,
                    threads: [],
                    daemon,
                    fda: loadFdaStatus(),
                    sync_running: running,
                    active_job_id: active?.id || activeJobId,
                    sync_results: loadSyncResults(),
                    update: readCachedUpdateInfo(),
                    version: (await import("../version.js")).PACKAGE_VERSION,
                }));
                return;
            }
            if (url.pathname === "/api/update/progress" && req.method === "GET") {
                const progress = readUpdateProgress();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(progress || { stage: "idle", percent: 0, message: "" }));
                return;
            }
            if (url.pathname === "/api/update/install" && req.method === "POST") {
                const { cmd, baseArgs } = resolveMcpInvocation();
                spawn(cmd, [...baseArgs, "update", "install", "--progress"], {
                    detached: true,
                    stdio: "ignore",
                    env: process.env,
                }).unref();
                res.writeHead(202, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ started: true }));
                return;
            }
            if (url.pathname === "/api/save" && req.method === "POST") {
                const body = await readJson(req);
                const patch = {};
                if (typeof body.propose_photos === "boolean")
                    patch.propose_photos = body.propose_photos;
                if (body.caption_mode === "off" || body.caption_mode === "server" || body.caption_mode === "local") {
                    patch.caption_mode = body.caption_mode;
                }
                const state = loadState(statePath);
                const rows = Array.isArray(body.threads)
                    ? body.threads.map((t) => ({
                        id: String(t.id),
                        label: "",
                        caption: t.caption !== false,
                        propose: t.propose !== false,
                    }))
                    : [];
                const nextState = applyThreadRows(state, rows);
                saveState(statePath, nextState);
                const saveRes = await fetch(`${apiBase}/api/me/connectors/imessage/media`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "X-MCP-Key": opts.token },
                    body: JSON.stringify(patch),
                });
                if (!saveRes.ok) {
                    const text = await saveRes.text();
                    res.writeHead(saveRes.status, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: text.slice(0, 200) }));
                    return;
                }
                await pushMediaRulesFromState(apiBase, opts.token, nextState);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            if (url.pathname === "/api/daemon/config" && req.method === "POST") {
                const body = await readJson(req);
                const config = parseSyncConfig(body);
                if (!config) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "invalid interval or sources" }));
                    return;
                }
                if (body.enabled === false) {
                    const r = uninstallDaemon();
                    if (!r.ok) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: r.error }));
                        return;
                    }
                }
                else {
                    const r = installDaemon(root, config);
                    if (!r.ok) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: r.error }));
                        return;
                    }
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            if (url.pathname === "/api/daemon/kick" && req.method === "POST") {
                const r = kickDaemon();
                if (!r.ok) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: r.error }));
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            if (url.pathname === "/api/sync" && req.method === "POST") {
                const body = await readJson(req);
                const source = String(body.source || "imessage");
                const allowed = ["imessage", "all"];
                if (!allowed.includes(source)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "invalid source" }));
                    return;
                }
                if (isSyncRunning()) {
                    res.writeHead(409, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "a sync is already running" }));
                    return;
                }
                const job = beginSyncJob(source, opts.token);
                activeJobId = job.id;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ id: job.id, status: job.status, lines: job.lines }));
                return;
            }
            const syncMatch = url.pathname.match(/^\/api\/sync\/([^/]+)$/);
            if (syncMatch && req.method === "GET") {
                const job = getJob(syncMatch[1]);
                if (!job) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "job not found" }));
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(job));
                return;
            }
            res.writeHead(404);
            res.end("not found");
        }
        catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message || String(e) }));
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port || 0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : (opts.port || 47821);
    if (opts.openBrowser !== false && platform() === "darwin") {
        try {
            execFileSync("open", [`http://127.0.0.1:${port}/`], { stdio: "ignore" });
        }
        catch { /* non-fatal */ }
    }
    return { port, close: () => server.close() };
}
function readJson(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
            }
            catch (e) {
                reject(e);
            }
        });
        req.on("error", reject);
    });
}
