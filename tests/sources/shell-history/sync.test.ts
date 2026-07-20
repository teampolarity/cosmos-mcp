import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncShellHistory } from "../../../src/sources/shell-history/sync.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("shell-history sync", () => {
  it("identifies the source-page POST as the shell-history connector", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cosmos-shell-history-"));
    directories.push(directory);
    const historyPath = join(directory, ".zsh_history");
    writeFileSync(historyPath, ": 1710000000:0;npm run test\n");
    const calls: Array<[string, RequestInit]> = [];

    const result = await syncShellHistory({
      state: { last_byte: 0, last_sync_at: null, last_path: null },
      apiBase: "https://cosmos.test",
      token: "pmk_test",
      historyPath,
      fetch: async (url, init = {}) => {
        calls.push([String(url), init]);
        if (String(url).endsWith("/whoami")) {
          return new Response(JSON.stringify({ polarity_user_id: "user-1" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "created", node_id: 42 }), { status: 200 });
      },
    });

    expect(result).toMatchObject({ status: "created", commands_shipped: 1, node_id: 42 });
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toBe("https://cosmos.test/api/polarity/source-page");
    expect(calls[1][1].headers).toMatchObject({
      "Content-Type": "application/json",
      "X-MCP-Key": "pmk_test",
      "User-Agent": "cosmos-mcp/shell-history",
    });
  });

  it("retries an edge-blocked source-page POST through the production Pages hostname", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cosmos-shell-history-"));
    directories.push(directory);
    const historyPath = join(directory, ".zsh_history");
    writeFileSync(historyPath, ": 1710000000:0;npm run test\n");
    const calls: Array<[string, RequestInit]> = [];

    const result = await syncShellHistory({
      state: { last_byte: 0, last_sync_at: null, last_path: null },
      apiBase: "https://cosmos.polarity-lab.com",
      token: "pmk_test",
      historyPath,
      fetch: async (url, init = {}) => {
        calls.push([String(url), init]);
        if (String(url).endsWith("/whoami")) {
          return new Response(JSON.stringify({ polarity_user_id: "user-1" }), { status: 200 });
        }
        if (String(url).startsWith("https://cosmos.polarity-lab.com")) {
          return new Response("<title>Attention Required! | Cloudflare</title>", { status: 403 });
        }
        return new Response(JSON.stringify({ status: "created", node_id: 43 }), { status: 200 });
      },
    });

    expect(result).toMatchObject({ status: "created", node_id: 43 });
    expect(calls.map(([url]) => url)).toEqual([
      "https://cosmos.polarity-lab.com/api/polarity/whoami",
      "https://cosmos.polarity-lab.com/api/polarity/source-page",
      "https://cosmos-2wu.pages.dev/api/polarity/source-page",
    ]);
    expect(calls[2][1].headers).toMatchObject({
      "X-MCP-Key": "pmk_test",
      "User-Agent": "cosmos-mcp/shell-history",
    });
  });
});
