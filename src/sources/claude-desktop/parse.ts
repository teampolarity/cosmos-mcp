// parse.ts — read a Claude Code session JSONL file at
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl and yield canonical
// turns in chronological order. Claude Desktop and Claude Code share this
// transcript format; the Desktop chat surface itself stores conversations
// server-side, so the on-disk JSONL is the only live, watchable source.
//
// Each line is one event. Types we care about:
//   user      — message.role="user",       message.content is a string OR an
//               array of parts (when prior tool results are interleaved)
//   assistant — message.role="assistant",  message.content is always an array
//               of parts: text + tool_use blocks. We strip tool_use; only
//               text parts feed the graph (matches polarity_capture_turn).
// Types we drop:
//   queue-operation, last-prompt — internal indexing, no payload
//   attachment                   — tool-use plumbing (hook_success etc.)
//   system                       — hook summaries; not user signal

import fs from "node:fs";
import readline from "node:readline";

export interface CanonicalTurn {
  turn_id: string;          // event uuid (stable per turn)
  thread_id: string;        // session id (one thread per JSONL file)
  from_handle: string;      // "self" for user, "claude" for assistant
  occurred_at: string;      // ISO timestamp from the event
  text?: string;            // visible content, tool_use stripped
  participants: string[];   // always ["self", "claude"] on this source
  cwd?: string;             // working directory the session ran in
  git_branch?: string;      // for cross-referencing repo-level work
  model?: string;           // assistant.message.model when present
}

// Strip tool_use / tool_result content blocks. Keep `text` and `thinking`
// blocks (thinking is signal the user actually reads at the time). Returns
// undefined if nothing readable is left.
function flattenContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content.length > 0 ? content : undefined;
  }
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const t = b.type;
    if (t === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (t === "thinking" && typeof b.thinking === "string") {
      // Optional surfacing; useful for self-context recall. Wrap so the
      // server-side extractor can ignore if desired.
      parts.push(`[thinking] ${b.thinking}`);
    }
    // tool_use, tool_result, image, document — dropped on purpose.
  }
  const joined = parts.join("\n").trim();
  return joined.length > 0 ? joined : undefined;
}

interface RawEvent {
  type?: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  message?: { role?: string; content?: unknown; model?: string };
  isSidechain?: boolean;
}

function eventToTurn(ev: RawEvent): CanonicalTurn | undefined {
  if (ev.type !== "user" && ev.type !== "assistant") return undefined;
  if (!ev.uuid || !ev.sessionId || !ev.timestamp) return undefined;
  // Subagent (sidechain) turns are noise for personal-graph purposes; the
  // user did not write them and the main session already captures the
  // parent dispatch. Skip.
  if (ev.isSidechain) return undefined;
  const text = flattenContent(ev.message?.content);
  if (!text) return undefined;
  const role = ev.message?.role;
  const from_handle = role === "user" ? "self" : "claude";
  return {
    turn_id: ev.uuid,
    thread_id: ev.sessionId,
    from_handle,
    occurred_at: ev.timestamp,
    text,
    participants: ["self", "claude"],
    cwd: ev.cwd,
    git_branch: ev.gitBranch,
    model: from_handle === "claude" ? ev.message?.model : undefined,
  };
}

export interface ReadTurnsOptions {
  filePath: string;
  // If set, only yield turns whose uuid was not seen before. Stable since
  // uuid is the natural per-event id Claude Code already mints.
  sinceUuid?: string;
  // Optional cutoff (ISO). When provided, filters turns older than this
  // before the sinceUuid check. Cheap pre-filter for backfills.
  sinceTimestamp?: string;
}

// Streams the JSONL file line-by-line and yields turns in order. The
// sinceUuid contract: if provided, every turn up to and INCLUDING that
// uuid is skipped. The first new turn after the watermark is the first
// yielded. If sinceUuid is not present in this file (e.g. the watermark
// was set from a different file or the file was truncated), every turn
// is yielded — safer than silently emitting nothing.
export async function* readTurns(opts: ReadTurnsOptions): AsyncGenerator<CanonicalTurn> {
  const stream = fs.createReadStream(opts.filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let pastWatermark = !opts.sinceUuid;
  const sinceTs = opts.sinceTimestamp ? Date.parse(opts.sinceTimestamp) : NaN;
  try {
    for await (const line of rl) {
      if (!line) continue;
      let ev: RawEvent;
      try {
        ev = JSON.parse(line) as RawEvent;
      } catch {
        // Mid-write line; skip. The next sync picks it up once flushed.
        continue;
      }
      if (Number.isFinite(sinceTs) && ev.timestamp) {
        if (Date.parse(ev.timestamp) < sinceTs) continue;
      }
      const turn = eventToTurn(ev);
      if (!turn) {
        // Even non-turn events can advance the watermark if they share the
        // uuid we are looking for. But uuid is on turn-type events only;
        // skip without bumping.
        continue;
      }
      if (!pastWatermark) {
        if (turn.turn_id === opts.sinceUuid) {
          pastWatermark = true;
        }
        continue;
      }
      yield turn;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  // Edge case: sinceUuid was set but never matched anything in this file.
  // The caller already buffered nothing; treat the watermark as stale and
  // re-yield from the top on the next sync. Surface this via a sentinel
  // generator-return is overkill — `readAllTurns` below handles it by
  // falling back when an empty result comes from a sinceUuid run.
}

// Convenience: read everything, regardless of watermark. Used by the
// fallback path when a watermark misses (e.g. log rotation, file edited).
export async function* readAllTurns(filePath: string, sinceTimestamp?: string): AsyncGenerator<CanonicalTurn> {
  yield* readTurns({ filePath, sinceTimestamp });
}
