import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const config = {
  interval_hours: 4,
  sources: {
    imessage: true,
    browser: true,
    calendar: false,
    claude_desktop: false,
    shell_history: true,
  },
};

const daemon = vi.hoisted(() => ({
  applyDaemonConfig: vi.fn(() => ({ ok: true })),
  getDaemonStatus: vi.fn(),
  installDaemon: vi.fn(),
  kickDaemon: vi.fn(),
  uninstallDaemon: vi.fn(),
}));

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  platform: () => "darwin",
}));
vi.mock("../../src/daemon/config.js", () => ({ loadSyncConfig: () => config }));
vi.mock("../../src/daemon/manage.js", () => daemon);
vi.mock("../../src/daemon/paths.js", () => ({
  daemonPaths: () => ({
    logPath: "/tmp/daemon.log",
    runnerPath: "/tmp/daemon-run.sh",
  }),
}));

import { runDaemonCli } from "../../src/daemon/cli.js";

describe("daemon configuration CLI", () => {
  it("prints stable JSON for desktop clients", async () => {
    const status = {
      installed: true,
      loaded: true,
      plist_path: "/tmp/cosmos.plist",
      app_path: "/Applications/Cosmos.app",
      log_path: "/tmp/daemon.log",
      config,
      last_imessage_sync_at: "2026-07-21T20:00:00Z",
    };
    daemon.getDaemonStatus.mockReturnValue(status);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await expect(runDaemonCli("status", ["--json"])).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(status)}\n`);
    } finally {
      stdout.mockRestore();
    }
  });

  it("applies saved source choices without changing whether the daemon is installed", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await expect(runDaemonCli("apply", [])).resolves.toBe(0);
      expect(daemon.applyDaemonConfig).toHaveBeenCalledWith(expect.any(String), config);
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
  });

  it("routes native source changes through the daemon apply command", () => {
    const source = readFileSync("src/daemon/NativeSettingsView.swift", "utf8");

    expect(source).toContain('runSync(["daemon", "apply"])');
  });
});
