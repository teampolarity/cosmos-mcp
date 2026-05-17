import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadState, saveState, defaultState } from "../../../src/sources/imessage/state.js";

describe("imessage state file", () => {
  it("returns default state when file missing", () => {
    const tmp = path.join(os.tmpdir(), `state-${Date.now()}.json`);
    const s = loadState(tmp);
    expect(s.handles).toEqual({});
    expect(s.threads).toEqual({});
    expect(s.last_sync_at).toBeNull();
  });

  it("round-trips a populated state", () => {
    const tmp = path.join(os.tmpdir(), `state-${Date.now()}-rt.json`);
    const s = defaultState();
    s.last_sync_at = "2026-05-17T08:00:00Z";
    s.handles["+12025550100"] = { name: "Theo", content_enabled: false };
    s.threads["chat-A"] = { last_turn_id_synced: "imessage:m-100", participants: ["+12025550100", "self"] };
    saveState(tmp, s);
    const loaded = loadState(tmp);
    expect(loaded).toEqual(s);
    fs.unlinkSync(tmp);
  });
});
