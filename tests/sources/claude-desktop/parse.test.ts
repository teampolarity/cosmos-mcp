// Parse covers: user role → "self", assistant role → "claude",
// tool_use blocks dropped, sidechain skipped, watermark resume.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTurns } from "../../../src/sources/claude-desktop/parse.js";

const TMP = path.join(os.tmpdir(), `claude-desktop-fixture-${Date.now()}.jsonl`);

const EVENTS = [
  { type: "queue-operation", operation: "enqueue", timestamp: "2026-05-19T08:00:00Z", sessionId: "s1" },
  // user, string content
  {
    type: "user", uuid: "u1", sessionId: "s1", timestamp: "2026-05-19T08:00:01Z",
    cwd: "/Users/shadrack/projects", gitBranch: "main",
    message: { role: "user", content: "hello cosmos" },
  },
  // assistant, array content with text + tool_use → only text kept
  {
    type: "assistant", uuid: "a1", sessionId: "s1", timestamp: "2026-05-19T08:00:02Z",
    message: {
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        { type: "text", text: "let me look" },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo" } },
      ],
    },
  },
  // sidechain → skipped even though it has content
  {
    type: "user", uuid: "u2", sessionId: "s1", timestamp: "2026-05-19T08:00:03Z",
    isSidechain: true,
    message: { role: "user", content: "subagent prompt" },
  },
  // user, only tool_result blocks → no usable text, skipped
  {
    type: "user", uuid: "u3", sessionId: "s1", timestamp: "2026-05-19T08:00:04Z",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "file contents" },
      ],
    },
  },
  // assistant turn after watermark target
  {
    type: "assistant", uuid: "a2", sessionId: "s1", timestamp: "2026-05-19T08:00:05Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    },
  },
];

beforeAll(() => {
  fs.writeFileSync(TMP, EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n");
});

afterAll(() => {
  try { fs.unlinkSync(TMP); } catch { /* ignore */ }
});

describe("claude-desktop parse", () => {
  it("yields user + assistant turns with tool_use stripped", async () => {
    const out = [];
    for await (const t of readTurns({ filePath: TMP })) out.push(t);
    expect(out.map((t) => t.turn_id)).toEqual(["u1", "a1", "a2"]);
    expect(out[0].from_handle).toBe("self");
    expect(out[1].from_handle).toBe("claude");
    expect(out[1].text).toBe("let me look");
    expect(out[1].model).toBe("claude-opus-4-7");
    expect(out[0].cwd).toBe("/Users/shadrack/projects");
    expect(out[0].git_branch).toBe("main");
  });

  it("respects sinceUuid watermark", async () => {
    const out = [];
    for await (const t of readTurns({ filePath: TMP, sinceUuid: "a1" })) out.push(t);
    expect(out.map((t) => t.turn_id)).toEqual(["a2"]);
  });

  it("yields nothing when sinceUuid is the latest", async () => {
    const out = [];
    for await (const t of readTurns({ filePath: TMP, sinceUuid: "a2" })) out.push(t);
    expect(out).toEqual([]);
  });

  it("filters by sinceTimestamp", async () => {
    const out = [];
    for await (const t of readTurns({ filePath: TMP, sinceTimestamp: "2026-05-19T08:00:04Z" })) out.push(t);
    expect(out.map((t) => t.turn_id)).toEqual(["a2"]);
  });
});
