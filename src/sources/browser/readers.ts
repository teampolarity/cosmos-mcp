// Browser-history readers. Each reader opens the browser's local
// SQLite database and yields a normalized stream of "page" records the
// rest of the pipeline can ship to cosmos. We never modify the live
// DB — open read-only, copy first if the browser holds an exclusive
// lock (Zen / Firefox do this while running).
//
// All readers return the same shape:
//   { url, title, hostname, last_visit, visit_count, source }
//
// Filtering noise (navigational visits like LinkedIn feed, Gmail inbox,
// the user's own sites) happens upstream in `filter.ts`; readers stay
// dumb and return everything they see.

import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface BrowserPage {
  url: string;
  title: string;
  hostname: string;
  last_visit: string; // ISO8601 UTC
  visit_count: number;
  source: "zen" | "firefox" | "safari" | "arc" | "chrome" | "brave";
}

const ZEN_PROFILES_DIR = path.join(os.homedir(), "Library", "Application Support", "zen", "Profiles");
const FIREFOX_PROFILES_DIR = path.join(os.homedir(), "Library", "Application Support", "Firefox", "Profiles");
const SAFARI_HISTORY_PATH = path.join(os.homedir(), "Library", "Safari", "History.db");
const ARC_HISTORY_PATH = path.join(os.homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "History");
const CHROME_HISTORY_PATH = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "Default", "History");

// Copy the DB to a tmp path first. Live browsers hold WAL+SHM, so even
// readonly opens can fail with "database is locked". Copying gives us
// a private snapshot for the duration of the run.
async function snapshot(src: string, tag: string): Promise<string> {
  const dest = path.join(os.tmpdir(), `cosmos-browser-${tag}-${Date.now()}.sqlite`);
  await fs.copyFile(src, dest);
  // WAL/SHM live alongside the DB and must come too for an
  // up-to-the-moment snapshot.
  for (const ext of ["-wal", "-shm"]) {
    try { await fs.copyFile(src + ext, dest + ext); } catch { /* file may not exist */ }
  }
  return dest;
}

// Firefox / Zen places.sqlite. Timestamps are microseconds since epoch.
// rev_host is the reversed hostname ("moc.elgoog." for google.com) so
// we read the regular `url` and parse hostname from it instead.
async function readPlacesSqlite(srcPath: string, source: BrowserPage["source"], sinceDays: number): Promise<BrowserPage[]> {
  const snap = await snapshot(srcPath, source);
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    const sinceMicros = (Date.now() - sinceDays * 86400 * 1000) * 1000;
    const rows = db.prepare(`
      SELECT url, COALESCE(title, '') AS title, visit_count, last_visit_date
      FROM moz_places
      WHERE visit_count > 0
        AND last_visit_date > ?
        AND url IS NOT NULL
        AND url NOT LIKE 'about:%'
        AND url NOT LIKE 'chrome://%'
        AND url NOT LIKE 'moz-extension://%'
      ORDER BY last_visit_date DESC
    `).all(sinceMicros) as Array<{ url: string; title: string; visit_count: number; last_visit_date: number | bigint | null }>;
    return rows.map((r) => ({
      url: r.url,
      title: r.title,
      hostname: parseHost(r.url),
      // last_visit_date is microseconds since epoch
      last_visit: new Date(Number(r.last_visit_date || 0) / 1000).toISOString(),
      visit_count: Number(r.visit_count || 0),
      source,
    }));
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch { /* tmp file */ }
  }
}

// Safari History.db. Timestamps are Mac absolute time (seconds since
// 2001-01-01 UTC). Join through history_visits → history_items.
async function readSafari(sinceDays: number): Promise<BrowserPage[]> {
  const snap = await snapshot(SAFARI_HISTORY_PATH, "safari");
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    // Safari's MAC_OFFSET = seconds between 1970-01-01 and 2001-01-01.
    const MAC_OFFSET = 978307200;
    const sinceMac = (Date.now() / 1000 - sinceDays * 86400) - MAC_OFFSET;
    const rows = db.prepare(`
      SELECT
        hi.url AS url,
        COALESCE(hv.title, '') AS title,
        hi.visit_count AS visit_count,
        MAX(hv.visit_time) AS last_visit_mac
      FROM history_items hi
      JOIN history_visits hv ON hv.history_item = hi.id
      WHERE hv.visit_time > ?
        AND hi.url IS NOT NULL
      GROUP BY hi.id
      ORDER BY last_visit_mac DESC
    `).all(sinceMac) as Array<{ url: string; title: string; visit_count: number; last_visit_mac: number }>;
    return rows.map((r) => ({
      url: r.url,
      title: r.title,
      hostname: parseHost(r.url),
      last_visit: new Date((Number(r.last_visit_mac) + MAC_OFFSET) * 1000).toISOString(),
      visit_count: Number(r.visit_count || 0),
      source: "safari" as const,
    }));
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch { /* tmp file */ }
  }
}

// Chromium (Arc, Chrome, Brave) History. Timestamps are "WebKit time" —
// microseconds since 1601-01-01.
async function readChromium(srcPath: string, source: BrowserPage["source"], sinceDays: number): Promise<BrowserPage[]> {
  const snap = await snapshot(srcPath, source);
  const db = new Database(snap, { readonly: true, fileMustExist: true });
  try {
    // Chromium uses microseconds since 1601-01-01. Offset between
    // 1601-01-01 and 1970-01-01 is 11644473600 seconds.
    const CHROME_EPOCH_OFFSET = 11644473600;
    const nowChrome = (Date.now() / 1000 + CHROME_EPOCH_OFFSET) * 1_000_000;
    const sinceChrome = nowChrome - (sinceDays * 86400 * 1_000_000);
    const rows = db.prepare(`
      SELECT url, COALESCE(title, '') AS title, visit_count, last_visit_time
      FROM urls
      WHERE visit_count > 0
        AND last_visit_time > ?
        AND url IS NOT NULL
        AND url NOT LIKE 'chrome://%'
        AND url NOT LIKE 'chrome-extension://%'
      ORDER BY last_visit_time DESC
    `).all(sinceChrome) as Array<{ url: string; title: string; visit_count: number; last_visit_time: number | bigint }>;
    return rows.map((r) => ({
      url: r.url,
      title: r.title,
      hostname: parseHost(r.url),
      last_visit: new Date(Number(r.last_visit_time) / 1000 - CHROME_EPOCH_OFFSET * 1000).toISOString(),
      visit_count: Number(r.visit_count || 0),
      source,
    }));
  } finally {
    db.close();
    try { await fs.unlink(snap); } catch { /* tmp file */ }
  }
}

function parseHost(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// Top-level dispatcher. Walks every known browser path, reads what
// exists, returns the merged stream. Caller decides which sources to
// include via the `sources` filter (default: all that exist).
export async function readAllBrowsers(
  sinceDays: number,
  sources: Set<BrowserPage["source"]> | null = null,
): Promise<BrowserPage[]> {
  const all: BrowserPage[] = [];

  // Zen — Firefox-style places.sqlite under a per-profile dir.
  if (!sources || sources.has("zen")) {
    try {
      const profiles = await fs.readdir(ZEN_PROFILES_DIR).catch(() => [] as string[]);
      for (const p of profiles) {
        const places = path.join(ZEN_PROFILES_DIR, p, "places.sqlite");
        if (await exists(places)) all.push(...await readPlacesSqlite(places, "zen", sinceDays));
      }
    } catch { /* not installed */ }
  }

  // Firefox — same shape as Zen.
  if (!sources || sources.has("firefox")) {
    try {
      const profiles = await fs.readdir(FIREFOX_PROFILES_DIR).catch(() => [] as string[]);
      for (const p of profiles) {
        const places = path.join(FIREFOX_PROFILES_DIR, p, "places.sqlite");
        if (await exists(places)) all.push(...await readPlacesSqlite(places, "firefox", sinceDays));
      }
    } catch { /* not installed */ }
  }

  if ((!sources || sources.has("safari")) && await exists(SAFARI_HISTORY_PATH)) {
    try { all.push(...await readSafari(sinceDays)); } catch { /* permission or corrupt */ }
  }

  if ((!sources || sources.has("arc")) && await exists(ARC_HISTORY_PATH)) {
    try { all.push(...await readChromium(ARC_HISTORY_PATH, "arc", sinceDays)); } catch {}
  }

  if ((!sources || sources.has("chrome")) && await exists(CHROME_HISTORY_PATH)) {
    try { all.push(...await readChromium(CHROME_HISTORY_PATH, "chrome", sinceDays)); } catch {}
  }

  return all;
}
