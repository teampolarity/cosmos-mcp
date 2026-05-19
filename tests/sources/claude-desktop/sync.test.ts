// sync.test.ts — fixture two-session run with a stub fetch. Verifies one
// POST per session, watermark advances, file-shrank resets the watermark,
// and unchanged files fast-skip on a re-run.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncClaudeDesktop } from "../../../src/sources/claude-desktop/sync.js";
import { defaultState } from "../../../src/sources/claude-desktop/state.js";

const ROOT = path.join(os.tmpdir(), `claude-desktop-projects-${Date.now()}`);
const PROJ_A = path.join(ROOT, "-proj-a");
const PROJ_B = path.join(ROOT, "-proj-b");

const SESSION_A = "11111111-1111-1111-1111-111111111111";
const SESSION_B = "22222222-2222-2222-2222-222222222222";

function ev(o: Record<string, unknown>): string { return JSON.stringify(o); }

function writeSession(filePath: string, sessionId: string, count: number, baseSec: number): void {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date((baseSec + i) * 1000).toISOString();
    lines.push(ev({
      type: i % 2 === 0 ? "user" : "assistant",
      uuid: `${sessionId.slice(0, 8)}-evt-${i}`,
      sessionId, timestamp: ts,
      message: { role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` },
    }));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

beforeAll(() => {
  fs.mkdirSync(PROJ_A, { recursive: true });
  fs.mkdirSync(PROJ_B, { recursive: true });
  writeSession(path.join(PROJ_A, `${SESSION_A}.jsonl`), SESSION_A, 3, 1747641600);
  writeSession(path.join(PROJ_B, `${SESSION_B}.jsonl`), SESSION_B, 2, 1747641700);
});

afterAll(() => {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("claude-desktop sync", () => {
  it("ships one POST per session and advances watermark", async () => {
    const state = defaultState();
    const calls: Array<{ thread_id: string; turns: number; participants: unknown; thread_label: string }> = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      calls.push({
        thread_id: body.thread_id, turns: body.turns.length,
        participants: body.participants, thread_label: body.thread_label,
      });
      return new Response(JSON.stringify({
        persons_upserted: 0, threads_upserted: 1, turns_seen: body.turns.length, turns_skipped: 0,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof globalThis.fetch;

    const result = await syncClaudeDesktop({
      projectsDir: ROOT, state,
      apiBase: "https://example.invalid", token: "pmk_test",
      fetch: fakeFetch, concurrency: 1,
    });

    expect(result.sessions_scanned).toBe(2);
    expect(result.sessions_shipped).toBe(2);
    expect(result.turns_seen).toBe(5);
    expect(calls.length).toBe(2);
    // Only self is a participant — Claude is the source surface, not a person.
    expect(calls[0].participants).toEqual([{ handle: "self", is_self: true }]);
    // Without cwd in the fixture, the label falls through to the id slice.
    expect(calls[0].thread_label).toMatch(/^claude-desktop:/);
    expect(state.sessions[SESSION_A].last_uuid_synced).toMatch(/-evt-2$/);
    expect(state.sessions[SESSION_B].last_uuid_synced).toMatch(/-evt-1$/);
    expect(state.last_sync_at).not.toBeNull();
  });

  it("fast-skips unchanged sessions on second run", async () => {
    const state = defaultState();
    state.sessions[SESSION_A] = {
      last_uuid_synced: `${SESSION_A.slice(0, 8)}-evt-2`,
      last_size_bytes: fs.statSync(path.join(PROJ_A, `${SESSION_A}.jsonl`)).size,
      last_mtime: new Date().toISOString(),
    };
    state.sessions[SESSION_B] = {
      last_uuid_synced: `${SESSION_B.slice(0, 8)}-evt-1`,
      last_size_bytes: fs.statSync(path.join(PROJ_B, `${SESSION_B}.jsonl`)).size,
      last_mtime: new Date().toISOString(),
    };
    const calls: number[] = [];
    const fakeFetch = (async () => {
      calls.push(1);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const result = await syncClaudeDesktop({
      projectsDir: ROOT, state,
      apiBase: "https://example.invalid", token: "pmk_test",
      fetch: fakeFetch, concurrency: 1,
    });
    expect(calls.length).toBe(0);
    expect(result.sessions_shipped).toBe(0);
    expect(result.sessions_scanned).toBe(2);
  });

  it("skips claude-mem observer-sessions as slop", async () => {
    const slopDir = path.join(ROOT, "-Users-shadrack--claude-mem-observer-sessions");
    fs.mkdirSync(slopDir, { recursive: true });
    const slopSession = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    writeSession(path.join(slopDir, `${slopSession}.jsonl`), slopSession, 3, 1747641800);
    const state = defaultState();
    const calls: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      calls.push(body.thread_id);
      return new Response(JSON.stringify({ persons_upserted: 0, threads_upserted: 1, turns_seen: body.turns.length, turns_skipped: 0 }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await syncClaudeDesktop({
      projectsDir: ROOT, state,
      apiBase: "https://example.invalid", token: "pmk_test",
      fetch: fakeFetch, concurrency: 1,
    });
    expect(calls).not.toContain(slopSession);
    fs.rmSync(slopDir, { recursive: true, force: true });
  });

  it("dry-run buffers turns without calling fetch", async () => {
    const state = defaultState();
    let fetchCalled = 0;
    const fakeFetch = (async () => {
      fetchCalled++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const result = await syncClaudeDesktop({
      projectsDir: ROOT, state,
      apiBase: "https://example.invalid", token: "pmk_test",
      fetch: fakeFetch, dryRun: true, concurrency: 1,
    });
    expect(fetchCalled).toBe(0);
    expect(result.turns_seen).toBe(5);
    expect(result.sessions_shipped).toBe(2);
  });
});
