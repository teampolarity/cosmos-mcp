// Coverage for CosmosClient methods beyond captureTurn. Mocks fetch so
// we can assert URL shape, header bag (auth mode switching, X-MCP-Client,
// traceparent) and request bodies for every method.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CosmosClient, CosmosError } from "../src/client/cosmos.js";
import { PACKAGE_VERSION } from "../src/version.js";
import type { Config } from "../src/config.js";

const mcpKeyConfig: Config = {
  cosmosUrl: "https://cosmos.example.com",
  authMode: "mcp_key",
  authToken: "pmk_test",
  polarityUserId: "user-abc",
};

const systemKeyConfig: Config = {
  cosmosUrl: "https://cosmos.example.com",
  authMode: "system_key",
  authToken: "sys_test",
  polarityUserId: "user-xyz",
};

function mockOkJson(payload: unknown) {
  // mockImplementation (not mockResolvedValue) so each call gets a fresh
  // Response — Response bodies are one-shot streams; sharing one across
  // calls throws "Body has already been read" on the second await.
  return vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function lastCall(fetchMock: ReturnType<typeof mockOkJson>): [URL, RequestInit] {
  const calls = fetchMock.mock.calls;
  return calls[calls.length - 1] as unknown as [URL, RequestInit];
}

describe("CosmosClient request envelope", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("attaches X-MCP-Key + X-Polarity-User-Id headers in mcp_key mode", async () => {
    const fetchMock = mockOkJson({ polarity_user_id: "user-abc", cosmos_user_id: 1 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).whoami();
    const [, init] = lastCall(fetchMock);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-MCP-Key"]).toBe("pmk_test");
    expect(headers["X-System-Key"]).toBeUndefined();
    expect(headers["X-Polarity-User-Id"]).toBe("user-abc");
  });

  it("swaps to X-System-Key in system_key mode and drops X-MCP-Key", async () => {
    const fetchMock = mockOkJson({ polarity_user_id: "user-xyz", cosmos_user_id: 2 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(systemKeyConfig).whoami();
    const [, init] = lastCall(fetchMock);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-System-Key"]).toBe("sys_test");
    expect(headers["X-MCP-Key"]).toBeUndefined();
  });

  it("User-Agent matches the package version (no stale 0.2.0 drift)", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).whoami();
    const [, init] = lastCall(fetchMock);
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(`cosmos-mcp/${PACKAGE_VERSION}`);
    expect(headers["User-Agent"]).not.toMatch(/0\.2\.0/);
  });

  it("emits a well-formed traceparent header and re-uses the trace id across calls", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new CosmosClient(mcpKeyConfig);
    await client.whoami();
    await client.whoami();
    const headersA = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const headersB = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headersA["traceparent"]).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
    const traceIdA = headersA["traceparent"].split("-")[1];
    const traceIdB = headersB["traceparent"].split("-")[1];
    expect(traceIdA).toBe(traceIdB);
    const parentA = headersA["traceparent"].split("-")[2];
    const parentB = headersB["traceparent"].split("-")[2];
    expect(parentA).not.toBe(parentB);
  });

  it("setClientInfo emits an X-MCP-Client header with name/version", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new CosmosClient(mcpKeyConfig);
    client.setClientInfo({ name: "claude-desktop", version: "1.4.2" });
    await client.whoami();
    const [, init] = lastCall(fetchMock);
    expect((init.headers as Record<string, string>)["X-MCP-Client"]).toBe(
      "claude-desktop/1.4.2",
    );
  });

  it("setClientInfo with no version falls back to the bare name", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new CosmosClient(mcpKeyConfig);
    client.setClientInfo({ name: "cursor" });
    await client.whoami();
    const [, init] = lastCall(fetchMock);
    expect((init.headers as Record<string, string>)["X-MCP-Client"]).toBe("cursor");
  });

  it("setClientInfo(null) clears the header so a later session starts clean", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new CosmosClient(mcpKeyConfig);
    client.setClientInfo({ name: "claude-code" });
    client.setClientInfo(null);
    await client.whoami();
    const [, init] = lastCall(fetchMock);
    expect((init.headers as Record<string, string>)["X-MCP-Client"]).toBeUndefined();
  });

  it("non-2xx responses surface as CosmosError with status + path + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "denied" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(new CosmosClient(mcpKeyConfig).whoami()).rejects.toMatchObject({
      status: 401,
      path: "/api/polarity/whoami",
      body: { error: "denied" },
    });
  });

  it("CosmosError preserves the body as raw text when the response is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("502 bad gateway", { status: 502 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await new CosmosClient(mcpKeyConfig).whoami();
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CosmosError);
      expect((e as CosmosError).status).toBe(502);
      expect((e as CosmosError).body).toBe("502 bad gateway");
    }
  });
});

describe("CosmosClient method routes + bodies", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("whoami → GET /api/polarity/whoami with no body", async () => {
    const fetchMock = mockOkJson({ polarity_user_id: "user-abc", cosmos_user_id: 1 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).whoami();
    const [url, init] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/whoami");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("export → POST /api/polarity/export with polarity_user_id in body", async () => {
    const fetchMock = mockOkJson({ format: "polarity/v1", nodes: [], edges: [], counts: { nodes: 0, edges: 0 } });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).export();
    const [url, init] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/export");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ polarity_user_id: "user-abc" });
  });

  it("getGraph(entity) → GET /api/polarity?entity=cosmos", async () => {
    const fetchMock = mockOkJson({ nodes: [] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).getGraph("cosmos");
    const [url] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity?entity=cosmos");
  });

  it("getGraph() with no entity omits the query param entirely", async () => {
    const fetchMock = mockOkJson({ nodes: [] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).getGraph();
    const [url] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity");
  });

  it("ask → POST /api/polarity/ask with polarity_user_id and query", async () => {
    const fetchMock = mockOkJson({ answer: "yes" });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).ask("what do I know about cosmos");
    const [url, init] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/ask");
    expect(JSON.parse(init.body as string)).toEqual({
      polarity_user_id: "user-abc",
      query: "what do I know about cosmos",
    });
  });

  it("observe → POST /api/polarity/observe merges polarity_user_id with the input", async () => {
    const fetchMock = mockOkJson({ node_id: 7, kind: "preference" });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).observe({
      text: "no em-dashes ever",
      kind: "preference",
      source: "claude-code",
      tags: ["writing", "voice"],
      confidence: 0.95,
    });
    const [, init] = lastCall(fetchMock);
    expect(JSON.parse(init.body as string)).toEqual({
      polarity_user_id: "user-abc",
      text: "no em-dashes ever",
      kind: "preference",
      source: "claude-code",
      tags: ["writing", "voice"],
      confidence: 0.95,
    });
  });

  it("dump → POST /api/polarity/dump", async () => {
    const fetchMock = mockOkJson({ cosmos_user_id: 1, location_node_id: 2, message_node_id: 3, edge_id: 4 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).dump({
      waypoint_id: "wp_1",
      name: "Joe's Pizza",
      lat: 40.7,
      lon: -74,
      message: "good slices",
    });
    const [url, init] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/dump");
    expect(JSON.parse(init.body as string).polarity_user_id).toBe("user-abc");
    expect(JSON.parse(init.body as string).waypoint_id).toBe("wp_1");
  });

  it("checkin → POST /api/polarity/checkin", async () => {
    const fetchMock = mockOkJson({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).checkin({
      waypoint_id: "wp_1",
      name: "Joe's Pizza",
      occurred_at: "2026-05-24T15:00:00.000Z",
    });
    const [url] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/checkin");
  });

  it("declare → POST /api/polarity/declare with chip enum", async () => {
    const fetchMock = mockOkJson({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await new CosmosClient(mcpKeyConfig).declare({
      waypoint_id: "wp_1",
      name: "Joe's Pizza",
      starts_at: "2026-05-24T20:00:00.000Z",
      ends_at: "2026-05-24T22:00:00.000Z",
      chip: "tonight",
    });
    const [url, init] = lastCall(fetchMock);
    expect(String(url)).toBe("https://cosmos.example.com/api/polarity/declare");
    expect(JSON.parse(init.body as string).chip).toBe("tonight");
  });
});

describe("CosmosClient against a non-root cosmosUrl base", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("resolves /api/* against the configured cosmosUrl host", async () => {
    const fetchMock = mockOkJson({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const cfg: Config = {
      ...mcpKeyConfig,
      cosmosUrl: "https://cosmos.staging.example.com",
    };
    await new CosmosClient(cfg).whoami();
    const [url] = lastCall(fetchMock);
    expect(url.toString()).toBe("https://cosmos.staging.example.com/api/polarity/whoami");
  });
});
