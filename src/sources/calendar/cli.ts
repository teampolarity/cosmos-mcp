// cosmos-mcp calendar sync — read the macOS Calendar.app sqlite DB
// (which also mirrors any subscribed Google / Microsoft accounts) and
// ship event aggregates to cosmos as `event` nodes.
//
// One node per unique (summary, calendar). For recurring events that
// fold into one row. Frequency, first-seen, last-seen, and the source
// calendar travel in the node content so the synthesis can spot
// rhythms ("you meet with Theo every Tuesday for the last six months"
// is far more readable than 26 individual event rows).
//
// Calendars that are pure noise (US Holidays, Birthdays, religious
// observance feeds) are dropped client-side.

import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_WINDOW_DAYS = 365;
const POST_BATCH_SIZE = 30;
const PER_BATCH_DELAY_MS = 150;

// Apple stores REAL timestamps as seconds since 2001-01-01 UTC.
const MAC_EPOCH_OFFSET = 978307200;

// Calendar titles we never want to ingest. They are auto-generated
// from external feeds and tell cosmos nothing about the user.
const NOISE_CALENDARS = new Set([
  "us holidays",
  "uk holidays",
  "canadian holidays",
  "australian holidays",
  "indian holidays",
  "german holidays",
  "french holidays",
  "religious holidays",
  "facebook birthdays",
  "birthdays",
  "siri found events",
  "siri suggestions",
  "found in mail",
  "found in natural language",
]);

interface CalendarEventRow {
  summary: string;
  description: string | null;
  calendar_title: string;
  start_date: number | null;
  end_date: number | null;
  all_day: number | null;
  has_attendees: number | null;
  has_recurrences: number | null;
  uuid: string | null;
}

interface CalendarAgg {
  summary: string;
  calendar: string;
  count: number;
  first_at: string; // ISO8601
  last_at: string;
  has_attendees: boolean;
  has_recurrences: boolean;
  uuid: string | null;
}

interface SyncState {
  apiBase: string;
  token: string;
  windowDays: number;
  dryRun: boolean;
  verbose: boolean;
  fetch: typeof globalThis.fetch;
}

export async function runCalendarCli(argv: string[]): Promise<number> {
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
    apiBase, token,
    windowDays: flags.days,
    dryRun: flags.dryRun, verbose: flags.verbose,
    fetch: globalThis.fetch,
  };

  process.stdout.write(`cosmos · calendar sync · last ${state.windowDays}d${state.dryRun ? ' · DRY RUN' : ''}\n`);

  const events = await readAppleCalendar(state.windowDays);
  process.stdout.write(`  read ${events.length.toLocaleString()} events from Apple Calendar\n`);

  const aggs = aggregate(events);
  process.stdout.write(`  ${aggs.length.toLocaleString()} unique (event, calendar) pairs after noise-filter\n`);

  if (state.verbose) {
    for (const a of aggs.slice(0, 10)) {
      process.stderr.write(`  ${a.count}× ${a.calendar} | ${a.summary.slice(0, 60)} | first=${a.first_at.slice(0,10)} last=${a.last_at.slice(0,10)}\n`);
    }
  }

  if (state.dryRun) { process.stdout.write(`done · dry run, nothing sent\n`); return 0; }
  if (aggs.length === 0) { process.stdout.write(`done · nothing to send\n`); return 0; }

  let sent = 0, created = 0, updated = 0, failed = 0;
  for (let i = 0; i < aggs.length; i += POST_BATCH_SIZE) {
    const batch = aggs.slice(i, i + POST_BATCH_SIZE);
    try {
      const res = await state.fetch(`${state.apiBase}/api/me/connectors/calendar/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MCP-Key": state.token },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) {
        const t = await res.text();
        process.stderr.write(`  batch ${Math.floor(i/POST_BATCH_SIZE)+1} failed: ${res.status} ${t.slice(0, 200)}\n`);
        failed += batch.length;
      } else {
        const j = await res.json() as { created?: number; updated?: number };
        created += j.created || 0; updated += j.updated || 0; sent += batch.length;
      }
    } catch (e) {
      failed += batch.length;
      if (state.verbose) process.stderr.write(`  batch error: ${(e as Error).message}\n`);
    }
    process.stdout.write(`  ${sent}/${aggs.length} sent · ${created} new · ${updated} refreshed · ${failed} failed\n`);
    await new Promise((r) => setTimeout(r, PER_BATCH_DELAY_MS));
  }

  process.stdout.write(`done · ${created} new · ${updated} refreshed · ${failed} failed\n`);
  return failed > 0 ? 1 : 0;
}

async function readAppleCalendar(windowDays: number): Promise<CalendarEventRow[]> {
  const src = path.join(os.homedir(), "Library", "Group Containers", "group.com.apple.calendar", "Calendar.sqlitedb");
  const snap = path.join(os.tmpdir(), `cosmos-cal-${Date.now()}.sqlitedb`);
  await fs.copyFile(src, snap);
  for (const ext of ["-wal", "-shm"]) {
    try { await fs.copyFile(src + ext, snap + ext); } catch {}
  }
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    // Window: events whose start_date >= now - windowDays. Mac time.
    const sinceMac = (Date.now() / 1000 - windowDays * 86400) - MAC_EPOCH_OFFSET;
    const rows = db.prepare(`
      SELECT
        ci.summary AS summary,
        ci.description AS description,
        c.title AS calendar_title,
        ci.start_date AS start_date,
        ci.end_date AS end_date,
        ci.all_day AS all_day,
        ci.has_attendees AS has_attendees,
        ci.has_recurrences AS has_recurrences,
        ci.UUID AS uuid
      FROM CalendarItem ci
      LEFT JOIN Calendar c ON c.ROWID = ci.calendar_id
      WHERE ci.summary IS NOT NULL
        AND ci.summary <> ''
        AND ci.start_date IS NOT NULL
        AND ci.start_date > ?
      ORDER BY ci.start_date DESC
    `).all(sinceMac) as CalendarEventRow[];
    return rows;
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch {}
    try { await fs.unlink(snap + "-wal"); } catch {}
    try { await fs.unlink(snap + "-shm"); } catch {}
  }
}

function aggregate(rows: CalendarEventRow[]): CalendarAgg[] {
  const map = new Map<string, CalendarAgg>();
  for (const r of rows) {
    const calTitle = (r.calendar_title || "").trim();
    if (NOISE_CALENDARS.has(calTitle.toLowerCase())) continue;

    const summary = (r.summary || "").trim();
    if (!summary) continue;

    // Skip obvious auto-generated entries (birthday placeholders etc).
    if (/^Birthday: /i.test(summary)) continue;
    if (/^Anniversary: /i.test(summary)) continue;

    const start = r.start_date != null ? new Date((r.start_date + MAC_EPOCH_OFFSET) * 1000).toISOString() : "";
    if (!start) continue;

    const key = `${calTitle}::${summary.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        summary, calendar: calTitle,
        count: 1, first_at: start, last_at: start,
        has_attendees: !!r.has_attendees,
        has_recurrences: !!r.has_recurrences,
        uuid: r.uuid,
      });
    } else {
      existing.count += 1;
      if (start < existing.first_at) existing.first_at = start;
      if (start > existing.last_at) existing.last_at = start;
      if (r.has_attendees) existing.has_attendees = true;
      if (r.has_recurrences) existing.has_recurrences = true;
    }
  }
  return [...map.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
}

function parseFlags(argv: string[]): { days: number; dryRun: boolean; verbose: boolean } {
  const verbose = argv.includes("--verbose") || argv.includes("-v");
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");
  const daysIdx = argv.findIndex((a) => a === "--days" || a === "-d");
  const days = daysIdx >= 0 && argv[daysIdx + 1]
    ? Math.max(1, Math.min(3650, Number(argv[daysIdx + 1]) || DEFAULT_WINDOW_DAYS))
    : DEFAULT_WINDOW_DAYS;
  return { days, dryRun, verbose };
}
