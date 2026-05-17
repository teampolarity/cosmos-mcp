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
  db.exec(`
    INSERT INTO handle (ROWID, id) VALUES (1, '+12025550100'), (2, '+19175550199');
    INSERT INTO chat (ROWID, guid) VALUES (1, 'iMessage;-;+12025550100'), (2, 'iMessage;-;chat0001');
    INSERT INTO message (ROWID, guid, text, handle_id, is_from_me, date) VALUES
      (1, 'm-001', 'hey', 1, 0, 800697600000000000),
      (2, 'm-002', 'sup',  1, 1, 800697660000000000),
      (3, 'm-003', 'lol',  2, 0, 800698800000000000);
    INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (1, 2), (2, 3);
    INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2);
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
    expect(turns.length).toBe(3);
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
    expect(turns.length).toBe(1);
    expect(turns[0].turn_id).toContain("m-003");
  });

  it("chunks at chunkSize boundary", async () => {
    const chunks: any[][] = [];
    for await (const chunk of readTurns({ dbPath: TMP, since: new Date(0), chunkSize: 2 })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(2);
    expect(chunks[1].length).toBe(1);
  });
});
