import { describe, it, expect } from "vitest";
import {
  generateTraceParent,
  formatTraceParent,
  extractTraceContext,
} from "../src/trace.js";

describe("trace context", () => {
  it("generateTraceParent mints a 32-hex trace id and 16-hex parent id", () => {
    const ctx = generateTraceParent();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.parentId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.flags).toBe("01");
  });

  it("generateTraceParent reuses a passed traceId so a session can stay glued", () => {
    const seed = "a".repeat(32);
    const first = generateTraceParent(seed);
    const second = generateTraceParent(first.traceId);
    expect(first.traceId).toBe(seed);
    expect(second.traceId).toBe(seed);
    expect(first.parentId).not.toBe(second.parentId);
  });

  it("formatTraceParent emits the canonical 4-part header value", () => {
    const ctx = {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      parentId: "b7ad6b7169203331",
      flags: "01",
    };
    expect(formatTraceParent(ctx)).toBe(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    );
  });

  it("extractTraceContext round-trips a header produced by formatTraceParent", () => {
    const ctx = generateTraceParent();
    const header = formatTraceParent(ctx);
    const parsed = extractTraceContext({ traceparent: header });
    expect(parsed).toEqual(ctx);
  });

  it("extractTraceContext returns null on malformed or missing headers", () => {
    expect(extractTraceContext({})).toBeNull();
    expect(extractTraceContext({ traceparent: "not-a-traceparent" })).toBeNull();
    expect(
      extractTraceContext({ traceparent: "01-shorttrace-shortparent-01" }),
    ).toBeNull();
  });

  it("extractTraceContext is case-insensitive on the header name (Traceparent variant)", () => {
    const header = "00-" + "1".repeat(32) + "-" + "2".repeat(16) + "-00";
    const parsed = extractTraceContext({ Traceparent: header });
    expect(parsed?.traceId).toBe("1".repeat(32));
    expect(parsed?.parentId).toBe("2".repeat(16));
    expect(parsed?.flags).toBe("00");
  });
});
