// cli.ts — `cosmos-mcp imessage <subcommand>` entrypoint. v1 supports
// only `sync` (metadata-only, default 90-day window) and `status`.

import os from "node:os";
import path from "node:path";
import { readTurns } from "./chat-db.js";
import { loadContacts } from "./contacts.js";
import { defaultPath, loadState, saveState } from "./state.js";
import { syncImessage } from "./sync.js";

const CHAT_DB_PATH = path.join(os.homedir(), "Library", "Messages", "chat.db");
const DEFAULT_WINDOW_DAYS = 90;

function parseIntFlag(rest: string[], name: string): number | undefined {
  // Accepts both --flag=N and --flag N.
  const eq = rest.find((a) => a.startsWith(`${name}=`));
  if (eq) {
    const n = parseInt(eq.slice(name.length + 1), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  const idx = rest.indexOf(name);
  if (idx >= 0 && rest[idx + 1]) {
    const n = parseInt(rest[idx + 1], 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseStringFlag(rest: string[], name: string): string | undefined {
  const eq = rest.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = rest.indexOf(name);
  if (idx >= 0 && rest[idx + 1]) return rest[idx + 1];
  return undefined;
}

export async function runImessageCli(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const verbose = rest.includes("--verbose") || rest.includes("-v");
  const concurrency = parseIntFlag(rest, "--concurrency");
  const sinceFlag = parseStringFlag(rest, "--since");
  const backfill = rest.includes("--backfill");
  switch (sub) {
    case "sync": return runSync({ verbose, concurrency, sinceFlag, backfill });
    case "status": return runStatus();
    default:
      process.stderr.write(
        `Usage: cosmos-mcp imessage <sync|status> [--verbose] [--concurrency N]\n` +
        `  --since YYYY-MM-DD  sync everything since that date (overrides state)\n` +
        `  --backfill          re-sync the original 90-day window regardless of state\n`
      );
      return 1;
  }
}

interface SyncFlags {
  verbose: boolean;
  concurrency?: number;
  sinceFlag?: string;
  backfill?: boolean;
}

async function runSync(flags: SyncFlags): Promise<number> {
  const apiBase = process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";
  const token = process.env.COSMOS_TOKEN;
  if (!token) {
    process.stderr.write("error: COSMOS_TOKEN env var not set.\n");
    return 1;
  }
  const statePath = defaultPath();
  const state = loadState(statePath);

  // `since` resolution, in priority order:
  //   1. --since YYYY-MM-DD (or any Date.parse-able string) — explicit
  //   2. --backfill — original 90-day window, ignoring state.last_sync_at
  //   3. state.last_sync_at — incremental from last successful run
  //   4. fallback — Date.now() - 90 days
  let since: Date;
  if (flags.sinceFlag) {
    const parsed = new Date(flags.sinceFlag);
    if (isNaN(parsed.getTime())) {
      process.stderr.write(`error: --since "${flags.sinceFlag}" is not a valid date\n`);
      return 1;
    }
    since = parsed;
  } else if (flags.backfill) {
    since = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86400 * 1000);
  } else if (state.last_sync_at) {
    since = new Date(state.last_sync_at);
  } else {
    since = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86400 * 1000);
  }
  if (!state.window_start_at) state.window_start_at = since.toISOString();
  process.stdout.write(`cosmos · iMessage sync · since ${since.toISOString()}\n`);

  // Resolve handles → names from AddressBook before posting. Names ride
  // along on the participants payload; server upsertPerson updates the
  // existing person node's label in place, so a re-sync turns every
  // phone-number node into the contact's name.
  const contacts = loadContacts({ verbose: flags.verbose });
  for (const [handle, name] of contacts) {
    const existing = state.handles[handle] || { content_enabled: false };
    state.handles[handle] = { ...existing, name };
  }
  const turns = readTurns({ dbPath: CHAT_DB_PATH, since, chunkSize: 2000, verbose: flags.verbose });
  try {
    const result = await syncImessage({
      turns, state, apiBase, token,
      verbose: flags.verbose,
      concurrency: flags.concurrency,
    });
    saveState(statePath, state);
    process.stdout.write(
      `\n  ${result.persons_upserted} persons upserted\n` +
      `  ${result.threads_upserted} threads upserted\n` +
      `  ${result.turns_seen} fresh turns\n` +
      `  ${result.turns_skipped} already synced\n` +
      `  ${result.text_backfilled ?? 0} text backfilled\n` +
      `\nstate: ${statePath}\n` +
      `\nobservation extraction runs server-side in the background.\n` +
      `reload /me in a couple minutes to see new observations land.\n`
    );
    return 0;
  } catch (e) {
    // Persist whatever threads succeeded before the throw so a partial sync
    // is recorded and a re-run does not redo work the server already accepted.
    try { saveState(statePath, state); } catch {}
    process.stderr.write(`sync failed: ${(e as Error).message}\n`);
    return 1;
  }
}

async function runStatus(): Promise<number> {
  const statePath = defaultPath();
  const state = loadState(statePath);
  process.stdout.write(JSON.stringify({
    state_path: statePath,
    last_sync_at: state.last_sync_at,
    window_start_at: state.window_start_at,
    handles_count: Object.keys(state.handles).length,
    threads_count: Object.keys(state.threads).length,
  }, null, 2) + "\n");
  return 0;
}
