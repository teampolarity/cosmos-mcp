import { describe, expect, it } from "vitest";
import { parseSyncConfig } from "../../src/settings/server.js";

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
});
