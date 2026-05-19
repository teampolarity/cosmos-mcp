// cosmos-mcp calendar sync.
//
// Two readers, one aggregation path:
//
//   EventKit  — spawns the signed `cosmos-eventkit` binary shipped in
//               Cosmos Sync.app. Gives structured attendees (name +
//               email), real recurrence flags, and the calendar's
//               account type. Preferred.
//   sqlite    — snapshot-copies Calendar.sqlitedb and reads it directly.
//               Fallback for when the daemon .app is not installed.
//               No attendee detail, no calendar type.
//
// Both readers emit NormalizedEvent[]. aggregate() folds occurrences of
// the same (summary, calendar) into one row carrying frequency, the
// first/last occurrence, and the union of everyone seen on it, so the
// synthesis can read rhythms ("standup, 48 instances, with the same
// four people") instead of hundreds of separate events.
//
// Calendars that are pure noise (holidays, birthdays, Siri-suggested)
// are dropped client-side.

import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

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

interface Attendee {
  name: string | null;
  email: string | null;
}

// The shape both readers normalize to before aggregation.
interface NormalizedEvent {
  summary: string;
  calendar: string;
  calendar_type: string; // 'local' | 'caldav' | ... | 'unknown'
  start: string; // ISO8601
  has_attendees: boolean;
  has_recurrences: boolean;
  attendees: Attendee[];
}

interface CalendarAgg {
  summary: string;
  calendar: string;
  calendar_type: string;
  count: number;
  first_at: string; // ISO8601
  last_at: string;
  has_attendees: boolean;
  has_recurrences: boolean;
  attendees: Attendee[]; // deduped union across occurrences
}

// Raw EventKit bridge output — one JSON object per stdout line.
interface EventKitRow {
  title: string;
  calendar: string;
  calendar_type: string;
  start: string;
  end: string | null;
  all_day: boolean;
  recurring: boolean;
  has_notes: boolean;
  location: string | null;
  attendees: Attendee[];
  organizer: Attendee | null;
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

  // Prefer EventKit. Fall back to the sqlite reader if the daemon .app
  // (and therefore the cosmos-eventkit binary) is not installed.
  let events: NormalizedEvent[];
  const ekBinary = findEventKitBinary();
  if (ekBinary) {
    process.stdout.write(`  reader: EventKit (${ekBinary})\n`);
    const ek = await readViaEventKit(ekBinary, state.windowDays, state.verbose);
    if (ek) {
      events = ek;
    } else {
      process.stdout.write(`  EventKit read failed, falling back to sqlite\n`);
      events = await readViaSqlite(state.windowDays);
    }
  } else {
    process.stdout.write(`  reader: sqlite (daemon .app not installed)\n`);
    events = await readViaSqlite(state.windowDays);
  }
  process.stdout.write(`  read ${events.length.toLocaleString()} event occurrences\n`);

  const aggs = aggregate(events);
  process.stdout.write(`  ${aggs.length.toLocaleString()} unique (event, calendar) pairs after noise-filter\n`);

  if (state.verbose) {
    for (const a of aggs.slice(0, 10)) {
      process.stderr.write(`  ${a.count}× ${a.calendar} | ${a.summary.slice(0, 50)} | ${a.attendees.length} ppl\n`);
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

// ---- EventKit reader --------------------------------------------------------

// The cosmos-eventkit binary lives inside the signed Cosmos Sync.app.
// Prefer the installed copy — that is the one the user granted calendar
// access to. /Applications is checked too in case the app was installed
// system-wide instead of per-user.
function findEventKitBinary(): string | null {
  if (process.platform !== "darwin") return null;
  const candidates = [
    path.join(os.homedir(), "Applications", "Cosmos Sync.app", "Contents", "MacOS", "cosmos-eventkit"),
    path.join("/Applications", "Cosmos Sync.app", "Contents", "MacOS", "cosmos-eventkit"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// Spawn cosmos-eventkit and parse its NDJSON. Returns null on any
// failure (access denied = exit 2, other error = exit 1) so the caller
// can fall back to sqlite.
async function readViaEventKit(
  binPath: string,
  windowDays: number,
  verbose: boolean,
): Promise<NormalizedEvent[] | null> {
  try {
    const { stdout, stderr } = await execFileP(
      binPath,
      ["--days", String(windowDays)],
      { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
    );
    if (verbose && stderr) process.stderr.write(`  [eventkit] ${stderr.trim()}\n`);
    const out: NormalizedEvent[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      let row: EventKitRow;
      try { row = JSON.parse(line) as EventKitRow; } catch { continue; }
      const attendees = (row.attendees || []).filter((a) => a && (a.email || a.name));
      out.push({
        summary: row.title || "",
        calendar: row.calendar || "",
        calendar_type: row.calendar_type || "unknown",
        start: row.start,
        has_attendees: attendees.length > 0,
        has_recurrences: !!row.recurring,
        attendees,
      });
    }
    return out;
  } catch (e) {
    const err = e as { code?: number; stderr?: string };
    if (verbose) {
      process.stderr.write(`  [eventkit] failed (exit ${err.code ?? "?"})${err.stderr ? ": " + err.stderr.trim() : ""}\n`);
    }
    return null;
  }
}

// ---- sqlite reader (fallback) -----------------------------------------------

async function readViaSqlite(windowDays: number): Promise<NormalizedEvent[]> {
  const src = path.join(os.homedir(), "Library", "Group Containers", "group.com.apple.calendar", "Calendar.sqlitedb");
  const snap = path.join(os.tmpdir(), `cosmos-cal-${Date.now()}.sqlitedb`);
  await fs.copyFile(src, snap);
  for (const ext of ["-wal", "-shm"]) {
    try { await fs.copyFile(src + ext, snap + ext); } catch {}
  }
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    const sinceMac = (Date.now() / 1000 - windowDays * 86400) - MAC_EPOCH_OFFSET;
    const rows = db.prepare(`
      SELECT
        ci.summary AS summary,
        c.title AS calendar_title,
        ci.start_date AS start_date,
        ci.has_attendees AS has_attendees,
        ci.has_recurrences AS has_recurrences
      FROM CalendarItem ci
      LEFT JOIN Calendar c ON c.ROWID = ci.calendar_id
      WHERE ci.summary IS NOT NULL
        AND ci.summary <> ''
        AND ci.start_date IS NOT NULL
        AND ci.start_date > ?
      ORDER BY ci.start_date DESC
    `).all(sinceMac) as Array<{
      summary: string;
      calendar_title: string | null;
      start_date: number;
      has_attendees: number | null;
      has_recurrences: number | null;
    }>;
    return rows.map((r) => ({
      summary: r.summary || "",
      calendar: (r.calendar_title || "").trim(),
      calendar_type: "unknown",
      start: new Date((r.start_date + MAC_EPOCH_OFFSET) * 1000).toISOString(),
      has_attendees: !!r.has_attendees,
      has_recurrences: !!r.has_recurrences,
      attendees: [],
    }));
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch {}
    try { await fs.unlink(snap + "-wal"); } catch {}
    try { await fs.unlink(snap + "-shm"); } catch {}
  }
}

// ---- aggregation ------------------------------------------------------------

function aggregate(events: NormalizedEvent[]): CalendarAgg[] {
  const map = new Map<string, CalendarAgg>();
  for (const e of events) {
    const calTitle = (e.calendar || "").trim();
    if (NOISE_CALENDARS.has(calTitle.toLowerCase())) continue;

    const summary = (e.summary || "").trim();
    if (!summary) continue;
    if (/^Birthday: /i.test(summary)) continue;
    if (/^Anniversary: /i.test(summary)) continue;

    const start = e.start;
    if (!start) continue;

    const key = `${calTitle}::${summary.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        summary, calendar: calTitle,
        calendar_type: e.calendar_type || "unknown",
        count: 1, first_at: start, last_at: start,
        has_attendees: e.has_attendees,
        has_recurrences: e.has_recurrences,
        attendees: dedupeAttendees(e.attendees),
      });
    } else {
      existing.count += 1;
      if (start < existing.first_at) existing.first_at = start;
      if (start > existing.last_at) existing.last_at = start;
      if (e.has_attendees) existing.has_attendees = true;
      if (e.has_recurrences) existing.has_recurrences = true;
      if (e.attendees.length) {
        existing.attendees = dedupeAttendees([...existing.attendees, ...e.attendees]);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
}

// Dedupe attendees by email (lowercased) when present, else by name.
// Caps the list so one huge all-hands does not balloon the payload.
function dedupeAttendees(list: Attendee[]): Attendee[] {
  const seen = new Map<string, Attendee>();
  for (const a of list) {
    if (!a || (!a.email && !a.name)) continue;
    const key = (a.email || a.name || "").trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { name: a.name ?? null, email: a.email ?? null });
  }
  return [...seen.values()].slice(0, 25);
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
