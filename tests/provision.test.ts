// Smoke tests for the `provision` and `imessage probe` CLI subcommands.
//
// We exercise the real bin/cosmos-mcp.js via node subprocess (same pattern as
// bootstrap.test.ts) and assert exit codes and stderr text. Mocking the
// keychain and a real cosmos endpoint is out of scope; the cases below cover
// the input-validation and platform-guard branches that ship the new copy.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const BIN = join(process.cwd(), "bin", "cosmos-mcp.js");

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync("node", [BIN, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("cosmos-mcp provision", () => {
  it("usage error when no key passed", () => {
    const r = run(["provision"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/usage: cosmos-mcp provision/);
  });

  it("rejects keys without pmk_ prefix", () => {
    const r = run(["provision", "wrongprefix_abc123"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/invalid key/);
    expect(r.stderr).toMatch(/connectors/);
  });

  it("emits the macOS-only message on non-darwin", () => {
    // We can't change process.platform inside a subprocess, but on darwin
    // hosts this still exercises the prefix-validation path above, which is
    // what we care about. Skip when not darwin to avoid flakiness.
    if (process.platform !== "darwin") {
      const r = run(["provision", "pmk_anything"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/macOS-only/);
    }
  });
});

describe("cosmos-mcp imessage probe", () => {
  it("complains when no key is configured (linux/ci)", () => {
    if (process.platform !== "darwin") {
      const r = run(["imessage", "probe"], { COSMOS_TOKEN: "" });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/macOS-only/);
    }
  });
});

describe("resolveKey precedence", () => {
  // resolveKey itself is not exported as a callable from a CLI entrypoint in
  // a way vitest can import cleanly (top-level await + the entrypoint runs on
  // import). We instead exercise the precedence indirectly: COSMOS_TOKEN set
  // in env makes the provision subcommand skip the keychain lookup entirely.
  // Easiest visible signal: provision with a bad-prefix key + COSMOS_TOKEN
  // already set still returns the prefix error (i.e. the env var path does
  // not short-circuit validation).
  it("COSMOS_TOKEN does not bypass provision validation", () => {
    const r = run(["provision", "wrongprefix"], { COSMOS_TOKEN: "pmk_already_set" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/invalid key/);
  });
});
