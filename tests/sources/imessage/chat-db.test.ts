// Verifies readTurns yields canonical turn objects from a SQLite
// fixture that mirrors Apple's chat.db schema for the columns we read.
// Apple stores message.date as nanoseconds since 2001-01-01T00:00:00Z;
// the offset from the Unix epoch is 978307200 seconds. The fixture's
// date values map to 2026-05-17T08:00:00Z and just after.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readTurns } from "../../../src/sources/imessage/chat-db.js";

const TMP = path.join(os.tmpdir(), `chat-fixture-${Date.now()}.db`);

// Apple-epoch nanoseconds for 2026-05-17T08:00:00Z is 800697600 * 1e9.
// Each turn below shifts by a minute to keep ordering deterministic.
const T0 = 800697600000000000n;
const MIN = 60_000_000_000n;

beforeAll(() => {
  const db = new Database(TMP);
  db.exec(`
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT);
    CREATE TABLE message (
      ROWID INTEGER PRIMARY KEY,
      guid TEXT,
      text TEXT,
      handle_id INTEGER,
      is_from_me INTEGER,
      date INTEGER
    );
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
  `);

  // Two real relationships (each handle gets 5+ incoming turns so it
  // clears MIN_EXCHANGE_TURNS), plus two slop chats:
  //
  //   chat 1 — +12025550100  (real, 6 turns, user replies)
  //   chat 2 — +19175550199  (real, 6 turns, user replies)
  //   chat 3 — 62227         (short-code SMS, user never replies)
  //   chat 4 — +13035550144  (user never replies)
  //
  // Total surviving turns: 12. Total turns including slop: 14.
  const insertHandles = db.prepare(`INSERT INTO handle (ROWID, id) VALUES (?, ?)`);
  insertHandles.run(1, "+12025550100");
  insertHandles.run(2, "+19175550199");
  insertHandles.run(3, "62227");
  insertHandles.run(4, "+13035550144");

  const insertChats = db.prepare(`INSERT INTO chat (ROWID, guid) VALUES (?, ?)`);
  insertChats.run(1, "iMessage;-;+12025550100");
  insertChats.run(2, "iMessage;-;chat0001");
  insertChats.run(3, "iMessage;-;62227");
  insertChats.run(4, "iMessage;-;+13035550144");

  const insertMsg = db.prepare(
    `INSERT INTO message (ROWID, guid, text, handle_id, is_from_me, date) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const cmj = db.prepare(`INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`);
  const chj = db.prepare(`INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (?, ?)`);

  // Chat 1: 8 turns — handle 1 sends 6, user replies twice. Volume on
  // handle 1 = 6 ≥ MIN_EXCHANGE_TURNS. All before 08:10.
  let rowId = 1;
  const c1Pattern = [0, 0, 1, 0, 0, 1, 0, 0]; // 6 incoming, 2 outgoing
  for (let i = 0; i < c1Pattern.length; i++) {
    const date = T0 + BigInt(i) * MIN;
    insertMsg.run(rowId, `m-c1-${i}`, `t${i}`, 1, c1Pattern[i], date);
    cmj.run(1, rowId);
    rowId++;
  }
  chj.run(1, 1);

  // Chat 2: 8 turns same pattern. All AFTER 08:10.
  const T_AFTER = 800698200000000000n;
  const c2Pattern = [0, 0, 1, 0, 0, 1, 0, 0];
  for (let i = 0; i < c2Pattern.length; i++) {
    const date = T_AFTER + BigInt(i) * MIN;
    insertMsg.run(rowId, `m-c2-${i}`, `t${i}`, 2, c2Pattern[i], date);
    cmj.run(2, rowId);
    rowId++;
  }
  chj.run(2, 2);

  // Chat 3: 1 turn from short-code, user never replies (slop)
  insertMsg.run(rowId, `m-c3-0`, `CODE 99`, 3, 0, T0 + 30n * MIN);
  cmj.run(3, rowId); chj.run(3, 3); rowId++;

  // Chat 4: 1 turn from full-length handle, user never replies (slop)
  insertMsg.run(rowId, `m-c4-0`, `cold pitch`, 4, 0, T0 + 31n * MIN);
  cmj.run(4, rowId); chj.run(4, 4); rowId++;

  db.close();
});

afterAll(() => { try { fs.unlinkSync(TMP); } catch {} });

describe("chat-db.readTurns", () => {
  it("yields turns with canonical fields", async () => {
    const turns: any[] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 100 })) {
      turns.push(...chunk);
    }
    // Two real chats × 8 turns = 16; slop chats dropped.
    expect(turns.length).toBe(16);
    const first = turns[0];
    expect(first).toMatchObject({
      turn_id: expect.any(String),
      from_handle: expect.stringMatching(/^(self|\+\d+)$/),
      occurred_at: expect.stringMatching(/^\d{4}-/),
      thread_id: expect.any(String),
    });
  });

  it("respects the since cutoff", async () => {
    const turns: any[] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date("2026-05-17T08:10:00Z"), chunkSize: 100 })) {
      turns.push(...chunk);
    }
    // Only chat 2's eight turns are after the cutoff.
    expect(turns.length).toBe(8);
    for (const t of turns) {
      expect(t.thread_id).toBe("iMessage;-;chat0001");
    }
  });

  it("chunks at chunkSize boundary", async () => {
    const chunks: any[][] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 5 })) {
      chunks.push(chunk);
    }
    // 16 surviving turns / chunkSize 5 → 5, 5, 5, 1.
    expect(chunks.length).toBe(4);
    expect(chunks[0].length).toBe(5);
    expect(chunks[3].length).toBe(1);
  });

  it("filters out slop threads (no-user-reply, short-code-only, low-volume)", async () => {
    const turns: any[] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 100 })) {
      turns.push(...chunk);
    }
    const threadIds = new Set(turns.map((t) => t.thread_id));
    expect(threadIds.has("iMessage;-;62227")).toBe(false);
    expect(threadIds.has("iMessage;-;+13035550144")).toBe(false);
    expect(threadIds.size).toBe(2);
  });
});
