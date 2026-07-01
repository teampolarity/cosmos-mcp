// cosmos-mcp calendar sync.
//
// Reads the macOS Calendar.app sqlite DB (which mirrors any subscribed
// Google / Microsoft accounts) and ships event aggregates to cosmos as
// `event` reference nodes.
//
// One node per unique (summary, calendar) pair. Recurring events fold
// into one row. Frequency, first-seen, last-seen, the source calendar,
// and the union of everyone seen on the event travel in the node
// content so the synthesis can read rhythms ("standup, 48 instances,
// the same four people") instead of hundreds of separate rows.
//
// Attendees come from the Calendar DB's Participant + Identity tables.
// The daemon already holds Full Disk Access for this file, so no extra
// permission is needed — EventKit would add a second TCC grant and a
// fragile prompt flow for no gain over reading the DB directly.
//
// Calendars that are pure noise (holidays, birthdays, Siri-suggested)
// are dropped client-side.

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

export interface Attendee {
  name: string | null;
  email: string | null;
}

export interface NormalizedEvent {
  summary: string;
  calendar: string;
  start: string; // ISO8601
  has_attendees: boolean;
  has_recurrences: boolean;
  attendees: Attendee[];
}

export interface CalendarAgg {
  summary: string;
  calendar: string;
  count: number;
  first_at: string; // ISO8601
  last_at: string;
  has_attendees: boolean;
  has_recurrences: boolean;
  attendees: Attendee[]; // deduped union across occurrences
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
  const withPeople = aggs.filter((a) => a.attendees.length > 0).length;
  process.stdout.write(`  ${aggs.length.toLocaleString()} unique (event, calendar) pairs · ${withPeople} with attendees\n`);

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

// ---- sqlite reader ----------------------------------------------------------

interface EventRow {
  rowid: number;
  summary: string;
  calendar_title: string | null;
  start_date: number;
  has_attendees: number | null;
  has_recurrences: number | null;
}

interface ParticipantRow {
  owner_id: number;
  email: string | null;
  name: string | null;
}

async function readAppleCalendar(windowDays: number): Promise<NormalizedEvent[]> {
  const src = path.join(os.homedir(), "Library", "Group Containers", "group.com.apple.calendar", "Calendar.sqlitedb");
  const snap = path.join(os.tmpdir(), `cosmos-cal-${Date.now()}.sqlitedb`);
  await fs.copyFile(src, snap);
  for (const ext of ["-wal", "-shm"]) {
    try { await fs.copyFile(src + ext, snap + ext); } catch {}
  }
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    const sinceMac = (Date.now() / 1000 - windowDays * 86400) - MAC_EPOCH_OFFSET;
    const eventRows = db.prepare(`
      SELECT
        ci.ROWID AS rowid,
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
    `).all(sinceMac) as EventRow[];

    // Attendees, keyed by the CalendarItem they belong to. Participant
    // rows carry an email directly; the display name lives on Identity,
    // joined via identity_id. is_self rows are the user on their own
    // events — drop them so the user never becomes their own attendee.
    const attendeesByEvent = new Map<number, Attendee[]>();
    try {
      const partRows = db.prepare(`
        SELECT
          p.owner_id AS owner_id,
          COALESCE(p.email, i.address) AS email,
          i.display_name AS name
        FROM Participant p
        LEFT JOIN Identity i ON i.ROWID = p.identity_id
        WHERE COALESCE(p.email, i.address) IS NOT NULL
          AND (p.is_self IS NULL OR p.is_self = 0)
      `).all() as ParticipantRow[];
      for (const r of partRows) {
        if (r.owner_id == null) continue;
        const list = attendeesByEvent.get(r.owner_id) ?? [];
        list.push({
          name: r.name && r.name.trim() ? r.name.trim() : null,
          email: r.email && r.email.trim() ? r.email.trim().toLowerCase() : null,
        });
        attendeesByEvent.set(r.owner_id, list);
      }
    } catch {
      // Older Calendar DB schemas may lack one of these tables. Attendee
      // enrichment is best-effort; the event sync still works without it.
    }

    return eventRows.map((r) => ({
      summary: r.summary || "",
      calendar: (r.calendar_title || "").trim(),
      start: new Date((r.start_date + MAC_EPOCH_OFFSET) * 1000).toISOString(),
      has_attendees: !!r.has_attendees,
      has_recurrences: !!r.has_recurrences,
      attendees: attendeesByEvent.get(r.rowid) ?? [],
    }));
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch {}
    try { await fs.unlink(snap + "-wal"); } catch {}
    try { await fs.unlink(snap + "-shm"); } catch {}
  }
}

// ---- aggregation ------------------------------------------------------------

export function aggregate(events: NormalizedEvent[]): CalendarAgg[] {
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
export function dedupeAttendees(list: Attendee[]): Attendee[] {
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
