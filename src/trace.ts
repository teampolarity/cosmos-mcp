// W3C Trace Context propagation for the MCP -> cosmos round trip.
//
// Spec: https://www.w3.org/TR/trace-context/
//
// Format:   <version>-<trace_id>-<parent_id>-<flags>
// Example:  00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
//
//   version    "00"            (current spec version)
//   trace_id   32 hex chars    (one per logical session)
//   parent_id  16 hex chars    (one per span / call)
//   flags      "01" (sampled) or "00"
//
// In cosmos-mcp the trace_id is held constant for the entire stdio
// session — every tool call by the same MCP client shares it — and a
// fresh parent_id is generated per call so the backend can reconstruct
// the call sequence. The backend upserts the trace into
// mcp_session_traces and writes one row to mcp_tool_calls per call.

const HEX = "0123456789abcdef";

function randomHex(bytes: number): string {
  const out: string[] = [];
  for (let i = 0; i < bytes; i++) {
    const b = Math.floor(Math.random() * 256);
    out.push(HEX[b >> 4]);
    out.push(HEX[b & 0x0f]);
  }
  return out.join("");
}

export interface TraceContext {
  traceId: string;
  parentId: string;
  flags: string;
}

export function generateTraceParent(traceId?: string): TraceContext {
  return {
    traceId: traceId || randomHex(16),
    parentId: randomHex(8),
    flags: "01",
  };
}

export function formatTraceParent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.parentId}-${ctx.flags}`;
}

// Parse a `traceparent` header into its parts. Returns null if the
// header is malformed; the W3C spec says receivers must not error on
// a bad traceparent, they should start a fresh trace instead.
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export function extractTraceContext(headers: Record<string, string | undefined>): TraceContext | null {
  const raw = headers["traceparent"] || headers["Traceparent"];
  if (typeof raw !== "string") return null;
  const m = raw.match(TRACEPARENT_RE);
  if (!m) return null;
  return { traceId: m[2], parentId: m[3], flags: m[4] };
}
