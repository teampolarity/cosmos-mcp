// cosmos-mcp browser sync — read local browser-history SQLite files,
// filter out navigational noise, and ship the meaningful pages up to
// cosmos as `reference` nodes (source='browser'). Same architectural
// shape as `imessage sync`: client-side reader + filter, server-side
// ingest, idempotent on the (user, url) key.

import { readAllBrowsers, type BrowserPage } from "./readers.js";
import { dedupeAndFilter } from "./filter.js";

const DEFAULT_WINDOW_DAYS = 180;
// 30 pages per batch keeps each Worker invocation well under the CPU
// ceiling (each page does a D1 lookup, a body-hash compare, an insert
// or update, and a Vectorize embed call — that compounds quickly).
// Smaller batches cost more round trips but stop the endpoint from
// timing out and silently dropping pages on the tail of the request.
const POST_BATCH_SIZE = 30;
const PER_BATCH_DELAY_MS = 150;

interface SyncState {
  apiBase: string;
  token: string;
  windowDays: number;
  dryRun: boolean;
  verbose: boolean;
  sources: Set<BrowserPage["source"]> | null;
  fetch: typeof globalThis.fetch;
}

export async function runBrowserCli(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const { loadConfig, UNCONFIGURED_MESSAGE } = await import("../../config.js");
  const cfg = loadConfig();
  const token = process.env.COSMOS_TOKEN || process.env.COSMOS_MCP_KEY || cfg?.authToken || "";
  const apiBase = process.env.COSMOS_URL || cfg?.cosmosUrl || "https://cosmos.polarity-lab.com";
  if (!token) {
    process.stderr.write(`error: ${UNCONFIGURED_MESSAGE}\n`);
    return 2;
  }

  const state: SyncState = {
    apiBase,
    token,
    windowDays: flags.days,
    dryRun: flags.dryRun,
    verbose: flags.verbose,
    sources: flags.sources,
    fetch: globalThis.fetch,
  };

  process.stdout.write(
    `cosmos · browser history sync · last ${state.windowDays}d` +
    (state.sources ? ` · sources=${[...state.sources].join(",")}` : ` · all browsers`) +
    (state.dryRun ? ` · DRY RUN` : ``) + `\n`
  );

  const raw = await readAllBrowsers(state.windowDays, state.sources);
  process.stdout.write(`  read ${raw.length.toLocaleString()} raw visits across all installed browsers\n`);

  const pages = dedupeAndFilter(raw);
  const dropped = raw.length - pages.length;
  process.stdout.write(`  ${pages.length.toLocaleString()} content URLs after filter (${dropped.toLocaleString()} navigational/noise dropped)\n`);

  if (state.verbose) {
    for (const p of pages.slice(0, 10)) {
      process.stderr.write(`  [${p.source}] ${p.last_visit.slice(0,10)} ${p.visit_count}× ${p.hostname}  ${p.title.slice(0, 60)}\n`);
    }
  }

  if (state.dryRun) {
    process.stdout.write(`done · dry run, nothing sent\n`);
    return 0;
  }

  if (pages.length === 0) {
    process.stdout.write(`done · nothing to send\n`);
    return 0;
  }

  let sent = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < pages.length; i += POST_BATCH_SIZE) {
    const batch = pages.slice(i, i + POST_BATCH_SIZE);
    try {
      const res = await state.fetch(`${state.apiBase}/api/me/connectors/browser/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MCP-Key": state.token },
        body: JSON.stringify({ pages: batch }),
      });
      if (!res.ok) {
        const t = await res.text();
        process.stderr.write(`  batch ${i / POST_BATCH_SIZE + 1} failed: ${res.status} ${t.slice(0, 200)}\n`);
        failed += batch.length;
      } else {
        const j = await res.json() as { created?: number; updated?: number };
        created += j.created || 0;
        updated += j.updated || 0;
        sent += batch.length;
      }
    } catch (e) {
      failed += batch.length;
      if (state.verbose) process.stderr.write(`  batch error: ${(e as Error).message}\n`);
    }
    process.stdout.write(`  ${sent}/${pages.length} sent · ${created} new · ${updated} refreshed · ${failed} failed\n`);
    await new Promise((r) => setTimeout(r, PER_BATCH_DELAY_MS));
  }

  process.stdout.write(`done · ${created} new · ${updated} refreshed · ${failed} failed\n`);
  return failed > 0 ? 1 : 0;
}

function parseFlags(argv: string[]): {
  days: number;
  dryRun: boolean;
  verbose: boolean;
  sources: Set<BrowserPage["source"]> | null;
} {
  const verbose = argv.includes("--verbose") || argv.includes("-v");
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");

  const daysIdx = argv.findIndex((a) => a === "--days" || a === "-d");
  const days = daysIdx >= 0 && argv[daysIdx + 1]
    ? Math.max(1, Math.min(3650, Number(argv[daysIdx + 1]) || DEFAULT_WINDOW_DAYS))
    : DEFAULT_WINDOW_DAYS;

  const sourcesIdx = argv.findIndex((a) => a === "--source" || a === "--sources" || a === "-s");
  let sources: Set<BrowserPage["source"]> | null = null;
  if (sourcesIdx >= 0 && argv[sourcesIdx + 1]) {
    sources = new Set(argv[sourcesIdx + 1].split(",").map((s) => s.trim()) as BrowserPage["source"][]);
  }

  return { days, dryRun, verbose, sources };
}
