import { describe, expect, it } from "vitest";
import { postBrowserBatch } from "../../../src/sources/browser/cli.js";

describe("browser sync", () => {
  it("retries the exact D1-overloaded batch before treating it as failed", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const bodies: string[] = [];
    const pages = [{
      url: "https://example.com/article",
      title: "Example article",
      hostname: "example.com",
      source: "safari" as const,
      visit_count: 2,
      last_visit: "2026-07-13T12:00:00.000Z",
    }];

    const result = await postBrowserBatch({
      apiBase: "https://cosmos.test",
      token: "test-key",
      pages,
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async (_url, init) => {
        calls += 1;
        bodies.push(String(init?.body));
        if (calls === 1) {
          return new Response(JSON.stringify({
            error: "internal: D1_ERROR: D1 DB is overloaded. Requests queued for too long.",
          }), { status: 500 });
        }
        return new Response(JSON.stringify({ created: 1, updated: 0 }), { status: 200 });
      },
    });

    expect(calls).toBe(2);
    expect(bodies).toEqual([
      JSON.stringify({ pages }),
      JSON.stringify({ pages }),
    ]);
    expect(sleeps).toEqual([2_000]);
    expect(result.response.ok).toBe(true);
  });

  it("retries a D1 CPU-limit reset before treating the batch as failed", async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await postBrowserBatch({
      apiBase: "https://cosmos.test",
      token: "test-key",
      pages: [],
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({
            error: "internal: D1_ERROR: D1 DB exceeded its CPU time limit and was reset.",
          }), { status: 500 });
        }
        return new Response(JSON.stringify({ created: 0, updated: 0 }), { status: 200 });
      },
    });

    expect(calls).toBe(2);
    expect(sleeps).toEqual([2_000]);
    expect(result.response.ok).toBe(true);
  });

  it("times out a stuck batch and retries it instead of wedging the entire sync", async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await postBrowserBatch({
      apiBase: "https://cosmos.test",
      token: "test-key",
      pages: [],
      timeoutMs: 1,
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async (_url, init) => {
        calls += 1;
        if (calls === 1) {
          if (!init?.signal) throw new Error("request timeout signal missing");
          return await new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("request timed out", "AbortError"));
            });
          });
        }
        return new Response(JSON.stringify({ created: 0, updated: 0 }), { status: 200 });
      },
    });

    expect(calls).toBe(2);
    expect(sleeps).toEqual([2_000]);
    expect(result.response.ok).toBe(true);
  });

  it("keeps the deadline active while reading a successful response body", async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await postBrowserBatch({
      apiBase: "https://cosmos.test",
      token: "test-key",
      pages: [],
      timeoutMs: 1,
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async (_url, init) => {
        calls += 1;
        if (calls === 1) {
          return new Response(new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () => {
                controller.error(new DOMException("response body timed out", "AbortError"));
              });
            },
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ created: 2, updated: 1 }), { status: 200 });
      },
    });

    expect(calls).toBe(2);
    expect(sleeps).toEqual([2_000]);
    expect(result.response.ok).toBe(true);
  });

  it("does not retry an unrelated permanent server error", async () => {
    let calls = 0;
    const result = await postBrowserBatch({
      apiBase: "https://cosmos.test",
      token: "test-key",
      pages: [],
      sleep: async () => { throw new Error("should not sleep"); },
      fetch: async () => {
        calls += 1;
        return new Response("internal error", { status: 500 });
      },
    });

    expect(calls).toBe(1);
    expect(result.response.status).toBe(500);
    expect(result.errorDetail).toBe("internal error");
  });
});
