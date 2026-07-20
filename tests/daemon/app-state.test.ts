import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appState = join(process.cwd(), "src/daemon/AppState.swift");

describe("native sync status", () => {
  it("keeps a successful iMessage sync healthy when Shell History failed", () => {
    const directory = mkdtempSync(join(tmpdir(), "cosmos-app-state-test-"));
    const harness = join(directory, "AppStateHarness.swift");
    const executable = join(directory, "app-state-harness");

    try {
      writeFileSync(harness, `import Foundation

@main
struct AppStateHarness {
    static func main() {
        let tick = DaemonTickStatus(
            finishedAt: Date(),
            imessageExit: 0,
            browserExit: 0,
            calendarExit: 0,
            claudeDesktopExit: 0,
            shellHistoryExit: 1
        )
        let status = AppState.imessageStatus(
            fda: .granted,
            lastSyncAt: Date(),
            daemon: tick
        )
        guard status == "ok" else {
            fatalError("expected iMessage status ok, got \\(status)")
        }
        let backgroundDetail = AppState.backgroundFailureDetail(daemon: tick)
        guard backgroundDetail == "Shell History" else {
            fatalError("expected Shell History detail, got \\(backgroundDetail ?? "nil")")
        }
    }
}
`);

      execFileSync("xcrun", ["swiftc", appState, harness, "-o", executable], { encoding: "utf8" });
      expect(execFileSync(executable, { encoding: "utf8" })).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
