import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDaemonConfig, buildRunner } from "../../src/daemon/manage.js";

describe("daemon runner", () => {
  it("runs Shell History before the slower browser backlog", () => {
    const runner = buildRunner("/tmp/npx", {
      interval_hours: 4,
      sources: {
        imessage: true,
        browser: true,
        calendar: true,
        claude_desktop: true,
        shell_history: true,
      },
    });

    expect(runner.indexOf("# shell-history")).toBeLessThan(runner.indexOf("# browser"));
  });

  it("writes each source's actual numeric exit status as valid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "cosmos-daemon-test-"));
    try {
      const fakeNpx = join(dir, "npx");
      const runner = join(dir, "daemon-run.sh");
      writeFileSync(fakeNpx, `#!/bin/bash
case "$3" in
  imessage) exit 0 ;;
  browser) exit 1 ;;
  calendar) exit 2 ;;
  claude-desktop) exit 3 ;;
  shell-history) exit 4 ;;
  *) exit 99 ;;
esac
`);
      chmodSync(fakeNpx, 0o755);
      writeFileSync(runner, buildRunner(fakeNpx, {
        interval_hours: 4,
        sources: {
          imessage: true,
          browser: true,
          calendar: true,
          claude_desktop: true,
          shell_history: true,
        },
      }));
      chmodSync(runner, 0o755);

      execFileSync("/bin/bash", [runner], { env: { ...process.env, HOME: dir } });

      expect(JSON.parse(readFileSync(join(dir, ".cosmos", "daemon-status.json"), "utf8"))).toMatchObject({
        imessage_exit: 0,
        browser_exit: 1,
        calendar_exit: 2,
        claude_desktop_exit: 3,
        shell_history_exit: 4,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies an enabled source configuration through the daemon installation boundary", () => {
    const home = mkdtempSync(join(tmpdir(), "cosmos-daemon-config-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    const config = {
      interval_hours: 8,
      sources: {
        imessage: true,
        browser: true,
        calendar: true,
        claude_desktop: true,
        shell_history: true,
      },
      auto_update: true,
    };
    const installs: Array<{ packageRoot: string; config: typeof config }> = [];

    try {
      const result = applyDaemonConfig("/tmp/cosmos-package", config, true, {
        install: (packageRoot: string, nextConfig: typeof config) => {
          installs.push({ packageRoot, config: nextConfig });
          return { ok: true };
        },
        uninstall: () => {
          throw new Error("enabled configuration must not uninstall the daemon");
        },
      });

      expect(result).toEqual({ ok: true });
      expect(installs).toEqual([{ packageRoot: "/tmp/cosmos-package", config }]);
      expect(JSON.parse(readFileSync(join(home, ".cosmos", "sync-config.json"), "utf8"))).toEqual(config);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
