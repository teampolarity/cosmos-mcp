import { afterEach, describe, expect, it, vi } from "vitest";

const daemon = vi.hoisted(() => ({
  applyDaemonConfig: vi.fn(() => ({ ok: true })),
  getDaemonStatus: vi.fn(() => ({
    installed: false,
    loaded: false,
    config: { interval_hours: 4, sources: { imessage: true } },
  })),
  installDaemon: vi.fn(() => ({ ok: true })),
  kickDaemon: vi.fn(() => ({ ok: true })),
  uninstallDaemon: vi.fn(() => ({ ok: true })),
}));

vi.mock("../../src/daemon/manage.js", () => daemon);

import { parseSyncConfig, startSettingsServer } from "../../src/settings/server.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("settings daemon config", () => {
  it("preserves every explicitly enabled Mac source instead of downgrading to iMessage-only", () => {
    expect(parseSyncConfig({
      interval_hours: 4,
      sources: {
        imessage: true,
        browser: true,
        calendar: true,
        claude_desktop: true,
        shell_history: true,
      },
    })).toMatchObject({
      interval_hours: 4,
      sources: {
        imessage: true,
        browser: true,
        calendar: true,
        claude_desktop: true,
        shell_history: true,
      },
    });
  });

  it("persists source choices through the daemon config boundary while background sync is off", async () => {
    const server = await startSettingsServer({
      token: "test-key",
      openBrowser: false,
    });
    const sources = {
      imessage: false,
      browser: true,
      calendar: true,
      claude_desktop: true,
      shell_history: true,
    };

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/daemon/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          interval_hours: 8,
          sources,
          auto_update: true,
        }),
      });

      expect(response.status).toBe(200);
      expect(daemon.applyDaemonConfig).toHaveBeenCalledWith(
        expect.any(String),
        {
          interval_hours: 8,
          sources,
          auto_update: true,
        },
        false,
      );
      expect(daemon.installDaemon).not.toHaveBeenCalled();
      expect(daemon.uninstallDaemon).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});
