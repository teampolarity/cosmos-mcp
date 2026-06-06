import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { captionImessageAttachments } from "../../../src/sources/imessage/caption.js";

let tmpDir = "";
let dbPath = "";
let imagePath = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cosmos-caption-test-"));
  dbPath = path.join(tmpDir, "chat.db");
  imagePath = path.join(tmpDir, "IMG_0001.jpg");
  fs.writeFileSync(imagePath, Buffer.from("fake-jpeg-bytes"));

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY, guid TEXT);
    CREATE TABLE attachment (
      ROWID INTEGER PRIMARY KEY,
      filename TEXT,
      mime_type TEXT,
      total_bytes INTEGER
    );
    CREATE TABLE message_attachment_join (ROWID INTEGER PRIMARY KEY, message_id INTEGER, attachment_id INTEGER);
  `);
  db.prepare("INSERT INTO message (ROWID, guid) VALUES (1, 'm1')").run();
  db.prepare("INSERT INTO attachment (ROWID, filename, mime_type, total_bytes) VALUES (1, ?, 'image/jpeg', ?)").run(imagePath, 15);
  db.prepare("INSERT INTO message_attachment_join (ROWID, message_id, attachment_id) VALUES (1, 1, 1)").run();
  db.close();
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("captionImessageAttachments", () => {
  it("reads a queued iMessage image from disk and posts base64 bytes for captioning", async () => {
    const posts: any[] = [];
    let queueCalls = 0;
    const fetchMock = async (url: any, init: any = {}) => {
      if (!init.method || init.method === "GET") {
        queueCalls++;
        return new Response(JSON.stringify({
          items: queueCalls === 1 ? [{
            turn_id: "imessage:m1",
            attachment_index: 0,
            kind: "photo",
            mime: "image/jpeg",
            filename: "IMG_0001.jpg",
            bytes: 15,
          }] : [],
        }), { status: 200 });
      }
      posts.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ caption: "Theo sent a photo from the studio." }), { status: 200 });
    };

    const totals = await captionImessageAttachments({
      apiBase: "https://cosmos.test",
      token: "pmk_test",
      dbPath,
      limit: 25,
      maxItems: 25,
      verbose: false,
      recaption: false,
      fetch: fetchMock as any,
      delayMs: 0,
    });

    expect(totals).toEqual({ processed: 1, captioned: 1, skipped: 0, failed: 0 });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://cosmos.test/api/me/connectors/conversations/caption");
    expect(posts[0].body).toMatchObject({
      turn_id: "imessage:m1",
      attachment_index: 0,
      image_b64: Buffer.from("fake-jpeg-bytes").toString("base64"),
      mime: "image/jpeg",
      force: false,
    });
  });

  it("continues pulling caption queue pages until the server queue is empty by default", async () => {
    const posts: any[] = [];
    let queueCalls = 0;
    const fetchMock = async (_url: any, init: any = {}) => {
      if (!init.method || init.method === "GET") {
        queueCalls++;
        return new Response(JSON.stringify({
          items: queueCalls <= 2
            ? [{ turn_id: "imessage:m1", attachment_index: 0, kind: "photo", mime: "image/jpeg", filename: "IMG_0001.jpg", bytes: 15 }]
            : [],
        }), { status: 200 });
      }
      posts.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ caption: "A caption." }), { status: 200 });
    };

    const totals = await captionImessageAttachments({
      apiBase: "https://cosmos.test",
      token: "pmk_test",
      dbPath,
      limit: 25,
      verbose: false,
      recaption: false,
      fetch: fetchMock as any,
      delayMs: 0,
    });

    expect(totals.processed).toBe(2);
    expect(totals.captioned).toBe(2);
    expect(posts).toHaveLength(2);
    expect(queueCalls).toBe(3);
  });

  it("marks unavailable local files so full automatic captioning can drain the queue", async () => {
    fs.unlinkSync(imagePath);
    const marks: any[] = [];
    let queueCalls = 0;
    const fetchMock = async (_url: any, init: any = {}) => {
      if (!init.method || init.method === "GET") {
        queueCalls++;
        return new Response(JSON.stringify({
          items: queueCalls === 1
            ? [{ turn_id: "imessage:m1", attachment_index: 0, kind: "photo", mime: "image/jpeg", filename: "IMG_0001.jpg", bytes: 15 }]
            : [],
        }), { status: 200 });
      }
      marks.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ marked: "file_unavailable" }), { status: 200 });
    };

    const totals = await captionImessageAttachments({
      apiBase: "https://cosmos.test",
      token: "pmk_test",
      dbPath,
      limit: 25,
      verbose: false,
      recaption: false,
      fetch: fetchMock as any,
      delayMs: 0,
    });

    expect(totals).toEqual({ processed: 1, captioned: 0, skipped: 1, failed: 0 });
    expect(marks).toEqual([
      { turn_id: "imessage:m1", attachment_index: 0, mark_failed: "file_unavailable" },
    ]);
  });
});
