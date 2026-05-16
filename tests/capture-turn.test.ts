// Unit tests for the polarity_capture_turn tool and its client method.
// Mocks the global fetch so we can assert request shape without hitting
// a real cosmos deploy.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CosmosClient } from "../src/client/cosmos.js";
import { TOOLS, findTool } from "../src/tools/index.js";
import type { Config } from "../src/config.js";

const config: Config = {
  cosmosUrl: "https://cosmos.example.com",
  authMode: "mcp_key",
  authToken: "pmk_test",
  polarityUserId: "user-abc",
};

function mockOkJson(payload: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("polarity_capture_turn", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // reset per test
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("registers the tool in TOOLS, ordered right after polarity_record_preference", () => {
    const names = TOOLS.map((t) => t.name);
    const prefIdx = names.indexOf("polarity_record_preference");
    const captureIdx = names.indexOf("polarity_capture_turn");
    expect(prefIdx).toBeGreaterThanOrEqual(0);
    expect(captureIdx).toBe(prefIdx + 1);
  });

  it("schema accepts a valid payload", () => {
    const tool = findTool("polarity_capture_turn")!;
    const ok = tool.inputSchema.safeParse({
      user_text: "hi",
      assistant_text: "hello back",
      source: "claude-code",
      max_observations: 5,
    });
    expect(ok.success).toBe(true);
  });

  it("schema accepts a minimal payload (user_text only)", () => {
    const tool = findTool("polarity_capture_turn")!;
    const ok = tool.inputSchema.safeParse({ user_text: "just this" });
    expect(ok.success).toBe(true);
  });

  it("schema rejects empty user_text", () => {
    const tool = findTool("polarity_capture_turn")!;
    const bad = tool.inputSchema.safeParse({ user_text: "" });
    expect(bad.success).toBe(false);
  });

  it("schema rejects unknown keys (strict)", () => {
    const tool = findTool("polarity_capture_turn")!;
    const bad = tool.inputSchema.safeParse({
      user_text: "hi",
      extra: "nope",
    });
    expect(bad.success).toBe(false);
  });

  it("schema rejects out-of-range max_observations", () => {
    const tool = findTool("polarity_capture_turn")!;
    expect(
      tool.inputSchema.safeParse({ user_text: "hi", max_observations: 0 }).success,
    ).toBe(false);
    expect(
      tool.inputSchema.safeParse({ user_text: "hi", max_observations: 21 }).success,
    ).toBe(false);
    expect(
      tool.inputSchema.safeParse({ user_text: "hi", max_observations: 1.5 }).success,
    ).toBe(false);
  });

  it("client.captureTurn POSTs to /api/polarity/capture-turn with the expected body", async () => {
    const fetchMock = mockOkJson({ created: [], extracted: 0, skipped: 0 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new CosmosClient(config);
    await client.captureTurn({
      user_text: "I prefer terse output.",
      assistant_text: "Noted.",
      source: "claude-code",
      max_observations: 8,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/capture-turn");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-MCP-Key"]).toBe("pmk_test");
    expect(headers["X-Polarity-User-Id"]).toBe("user-abc");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      polarity_user_id: "user-abc",
      user_text: "I prefer terse output.",
      assistant_text: "Noted.",
      source: "claude-code",
      max_observations: 8,
    });
  });

  it("client.captureTurn returns the parsed CaptureTurnResponse", async () => {
    const payload = {
      created: [
        { node_id: 101, kind: "preference", label: "prefers terse output" },
        { node_id: 102, kind: "observation", label: "uses claude-code" },
      ],
      extracted: 2,
      skipped: 0,
    };
    globalThis.fetch = mockOkJson(payload) as unknown as typeof fetch;

    const client = new CosmosClient(config);
    const res = await client.captureTurn({ user_text: "hi" });
    expect(res).toEqual(payload);
  });

  it("tool handler routes through client.captureTurn", async () => {
    const payload = { created: [], extracted: 0, skipped: 0 };
    globalThis.fetch = mockOkJson(payload) as unknown as typeof fetch;

    const client = new CosmosClient(config);
    const tool = findTool("polarity_capture_turn")!;
    const result = await tool.handler({ user_text: "hi" }, client);
    expect(result).toEqual(payload);
  });
});
