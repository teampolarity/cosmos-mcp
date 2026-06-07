// contacts.ts — reads macOS AddressBook to map iMessage handles to
// human names. Apple's chat.db stores only raw handles ("+14016039187",
// emails), so without this step every person node is a phone number.
//
// AddressBook is a Core Data SQLite store. Multiple "sources" (Local,
// iCloud, Exchange, etc.) each ship their own AddressBook-v22.abcddb,
// so we walk both ~/Library/Application Support/AddressBook/Sources/*
// and the legacy single-file path at the AddressBook root.
//
// Same Full Disk Access requirement as chat.db. If FDA is not granted,
// the open() calls throw and we return an empty map (sync proceeds with
// raw handles, no regression).

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ADDRESS_BOOK_ROOT = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "AddressBook",
);

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // chat.db uses E.164, with North American numbers as +1XXXXXXXXXX.
  // AddressBook stores anything — "(401) 603-9187", "401.603.9187",
  // "+1 401 603 9187", etc. Normalize to E.164 best-effort.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

function findAddressBookDbs(): string[] {
  const candidates: string[] = [];
  // Multi-source layout (modern macOS)
  const sourcesRoot = path.join(ADDRESS_BOOK_ROOT, "Sources");
  try {
    if (fs.existsSync(sourcesRoot)) {
      for (const entry of fs.readdirSync(sourcesRoot)) {
        const p = path.join(sourcesRoot, entry, "AddressBook-v22.abcddb");
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
  } catch {
    /* Full Disk Access not granted — fall through to legacy path or empty map */
  }
  // Legacy single-file layout
  try {
    const legacy = path.join(ADDRESS_BOOK_ROOT, "AddressBook-v22.abcddb");
    if (fs.existsSync(legacy)) candidates.push(legacy);
  } catch {
    /* Same permission guard */
  }
  return candidates;
}

export interface LoadContactsOptions {
  verbose?: boolean;
}

export function loadContacts(opts: LoadContactsOptions = {}): Map<string, string> {
  const map = new Map<string, string>();
  const dbs = findAddressBookDbs();
  if (opts.verbose) {
    process.stderr.write(`[contacts] found ${dbs.length} AddressBook source(s)\n`);
  }
  for (const dbPath of dbs) {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const rows = db
        .prepare(
          `SELECT
            r.ZFIRSTNAME    AS first,
            r.ZLASTNAME     AS last,
            r.ZNICKNAME     AS nick,
            r.ZORGANIZATION AS org,
            p.ZFULLNUMBER   AS phone,
            e.ZADDRESS      AS email
           FROM ZABCDRECORD r
           LEFT JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
           LEFT JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK`
        )
        .all() as Array<{
          first?: string | null;
          last?: string | null;
          nick?: string | null;
          org?: string | null;
          phone?: string | null;
          email?: string | null;
        }>;
      for (const r of rows) {
        const fullName = [r.first, r.last].filter(Boolean).join(" ").trim();
        const name = fullName || r.nick?.trim() || r.org?.trim() || "";
        if (!name) continue;
        const ph = normalizePhone(r.phone);
        if (ph && !map.has(ph)) map.set(ph, name);
        const em = normalizeEmail(r.email);
        if (em && !map.has(em)) map.set(em, name);
      }
    } catch (e) {
      if (opts.verbose) {
        process.stderr.write(`[contacts] skipped ${dbPath}: ${(e as Error).message}\n`);
      }
    } finally {
      if (db) db.close();
    }
  }
  if (opts.verbose) {
    process.stderr.write(`[contacts] resolved ${map.size} handle→name mappings\n`);
  }
  return map;
}
