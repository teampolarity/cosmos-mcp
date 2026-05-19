import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCommands, dedupeRun, isTrivial } from "../../../src/sources/shell-history/parse.js";

const TMP_PLAIN = path.join(os.tmpdir(), `shell-fixture-plain-${Date.now()}.txt`);
const TMP_EXT = path.join(os.tmpdir(), `shell-fixture-ext-${Date.now()}.txt`);
const TMP_CONT = path.join(os.tmpdir(), `shell-fixture-cont-${Date.now()}.txt`);

beforeAll(() => {
  fs.writeFileSync(TMP_PLAIN, [
    "cd wbru",
    "ls",
    "code .",
    "npm run dev",
    "",
    "git status",
  ].join("\n") + "\n");
  fs.writeFileSync(TMP_EXT, [
    ": 1747641600:0;cd wbru",
    ": 1747641620:0;npm run dev",
    ": 1747641800:0;git status",
  ].join("\n") + "\n");
  fs.writeFileSync(TMP_CONT, [
    "dig polarity-lab.com\\",
    "  @pete.ns.cloudflare.com",
    "echo done",
  ].join("\n") + "\n");
});

afterAll(() => {
  for (const f of [TMP_PLAIN, TMP_EXT, TMP_CONT]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe("shell-history parse", () => {
  it("reads plain-mode commands", () => {
    const out = [...readCommands(TMP_PLAIN)];
    expect(out.map((c) => c.command)).toEqual([
      "cd wbru", "ls", "code .", "npm run dev", "git status",
    ]);
    expect(out[0].ran_at_epoch).toBeNull();
  });

  it("reads extended-history with timestamps", () => {
    const out = [...readCommands(TMP_EXT)];
    expect(out.map((c) => c.command)).toEqual(["cd wbru", "npm run dev", "git status"]);
    expect(out[0].ran_at_epoch).toBe(1747641600);
    expect(out[2].ran_at_epoch).toBe(1747641800);
  });

  it("joins line continuations", () => {
    const out = [...readCommands(TMP_CONT)];
    expect(out.map((c) => c.command)).toEqual([
      "dig polarity-lab.com\n  @pete.ns.cloudflare.com",
      "echo done",
    ]);
  });

  it("respects sinceByte", () => {
    const stat = fs.statSync(TMP_PLAIN);
    const all = [...readCommands(TMP_PLAIN, 0)];
    const partial = [...readCommands(TMP_PLAIN, stat.size)];
    expect(all.length).toBeGreaterThan(0);
    expect(partial.length).toBe(0);
  });

  it("filters trivial commands", () => {
    expect(isTrivial("ls")).toBe(true);
    expect(isTrivial("cd ..")).toBe(true);
    expect(isTrivial("")).toBe(true);
    expect(isTrivial("y")).toBe(true);
    expect(isTrivial("npm run dev")).toBe(false);
    expect(isTrivial("npx wrangler deploy")).toBe(false);
  });

  it("dedupes consecutive duplicates keeping last", () => {
    const out = dedupeRun([
      { command: "git status", ran_at_epoch: 1 },
      { command: "git status", ran_at_epoch: 2 },
      { command: "npm run dev", ran_at_epoch: 3 },
      { command: "git status", ran_at_epoch: 4 },
    ]);
    expect(out.map((c) => c.ran_at_epoch)).toEqual([2, 3, 4]);
  });
});
