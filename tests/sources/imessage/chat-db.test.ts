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
  // Four chats:
  //   1) +12025550100  — user replied (real relationship)
  //   2) +19175550199  — user replied (real relationship)
  //   3) 62227         — SMS short code, user never replied (slop)
  //   4) +13035550144  — full-length number, user never replied (slop)
  db.exec(`
    INSERT INTO handle (ROWID, id) VALUES
      (1, '+12025550100'),
      (2, '+19175550199'),
      (3, '62227'),
      (4, '+13035550144');
    INSERT INTO chat (ROWID, guid) VALUES
      (1, 'iMessage;-;+12025550100'),
      (2, 'iMessage;-;chat0001'),
      (3, 'iMessage;-;62227'),
      (4, 'iMessage;-;+13035550144');
    INSERT INTO message (ROWID, guid, text, handle_id, is_from_me, date) VALUES
      (1, 'm-001', 'hey',     1, 0, 800697600000000000),
      (2, 'm-002', 'sup',     1, 1, 800697660000000000),
      (3, 'm-003', 'lol',     2, 0, 800698800000000000),
      (4, 'm-004', 'haha',    2, 1, 800698860000000000),
      (5, 'm-005', 'CODE 99', 3, 0, 800697700000000000),
      (6, 'm-006', 'pitch',   4, 0, 800697750000000000);
    INSERT INTO chat_message_join (chat_id, message_id) VALUES
      (1, 1), (1, 2),
      (2, 3), (2, 4),
      (3, 5),
      (4, 6);
    INSERT INTO chat_handle_join (chat_id, handle_id) VALUES
      (1, 1), (2, 2), (3, 3), (4, 4);
  `);
  db.close();
});

afterAll(() => { try { fs.unlinkSync(TMP); } catch {} });

describe("chat-db.readTurns", () => {
  it("yields turns with canonical fields", async () => {
    const turns: any[] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 100 })) {
      turns.push(...chunk);
    }
    // Chat 1 (2 turns) + chat 2 (2 turns) survive; chats 3 + 4 are slop.
    expect(turns.length).toBe(4);
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
    // Only chat 2's two turns are after the cutoff; chat 1 is before.
    expect(turns.length).toBe(2);
    expect(turns.map((t) => t.turn_id)).toEqual(
      expect.arrayContaining([expect.stringContaining("m-003"), expect.stringContaining("m-004")])
    );
  });

  it("chunks at chunkSize boundary", async () => {
    const chunks: any[][] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 2 })) {
      chunks.push(chunk);
    }
    // 4 surviving turns / chunkSize 2 → 2 chunks of 2.
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(2);
    expect(chunks[1].length).toBe(2);
  });

  it("filters out slop threads: user-never-replied and short-code-only", async () => {
    const turns: any[] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 100 })) {
      turns.push(...chunk);
    }
    // None of the slop chats should appear among the thread_ids.
    const threadIds = new Set(turns.map((t) => t.thread_id));
    expect(threadIds.has("iMessage;-;62227")).toBe(false);          // short-code
    expect(threadIds.has("iMessage;-;+13035550144")).toBe(false);   // no user reply
    expect(threadIds.size).toBe(2);
  });
});
