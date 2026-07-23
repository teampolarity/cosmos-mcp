import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runDaemonCli } from "../../src/daemon/cli.js";

describe("daemon status JSON integration", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  it("reads the last iMessage sync from the canonical state file", async () => {
    const home = mkdtempSync(join(tmpdir(), "cosmos-daemon-status-"));
    const stateDirectory = join(home, ".cosmos");
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(
      join(stateDirectory, "imessage-state.json"),
      JSON.stringify({
        last_sync_at: "2026-07-21T19:37:55.631Z",
        window_start_at: null,
        handles: {},
        threads: {},
      }),
    );
    process.env.HOME = home;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await expect(runDaemonCli("status", ["--json"])).resolves.toBe(0);
      const output = String(stdout.mock.calls[0]?.[0]);
      expect(JSON.parse(output)).toMatchObject({
        installed: false,
        loaded: false,
        last_imessage_sync_at: "2026-07-21T19:37:55.631Z",
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
