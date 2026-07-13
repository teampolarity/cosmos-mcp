// sync.ts — drives a chat-db read through to the cosmos endpoint.
// Groups turns by thread, applies state's handle->name map to enrich
// participants, posts each thread's slice as one request, updates
// state on success.

import { CanonicalTurn } from "./chat-db.js";
import { ImessageState } from "./state.js";

// Server caps each request at 2000 turns. Larger chunks = fewer HTTP
// trips on the first sync of a heavy account.
const CHUNK_SIZE = 2000;

// Process N threads in parallel. Each thread is independent on the
// server (different thread_node_id), and D1 batch() serializes the
// writes internally, so concurrent posts mostly buys us the HTTP round-
// trip latency overlap. 4 is conservative; raise if you have more.
const DEFAULT_CONCURRENCY = 4;

const MAX_D1_RETRIES = 3;
const DEFAULT_RETRY_AFTER_SEC = 60;

export interface SyncOptions {
  turns: AsyncGenerator<CanonicalTurn[]>;
  state: ImessageState;
  apiBase: string;
  token: string;
  fetch?: typeof globalThis.fetch;
  verbose?: boolean;
  concurrency?: number;
  /** Test hook — replace sleep during 503 retries. */
  sleep?: (ms: number) => Promise<void>;
}

export interface SyncResult {
  persons_upserted: number;
  threads_upserted: number;
  turns_seen: number;
  turns_skipped: number;
  observations_created: number;
  text_backfilled?: number;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfterSec(status: number, detail: string): number | null {
  if (status !== 503 && status !== 429) return null;
  try {
    const parsed = JSON.parse(detail) as { retry_after_sec?: number; error?: string };
    if (Number.isFinite(parsed.retry_after_sec) && Number(parsed.retry_after_sec) > 0) {
      return Number(parsed.retry_after_sec);
    }
    if (String(parsed.error || "").includes("d1_overloaded")) {
      return DEFAULT_RETRY_AFTER_SEC;
    }
  } catch {
    if (/d1_overloaded|database busy/i.test(detail)) return DEFAULT_RETRY_AFTER_SEC;
  }
  return DEFAULT_RETRY_AFTER_SEC;
}

export async function syncImessage(opts: SyncOptions): Promise<SyncResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? sleepMs;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const totals: SyncResult = {
    persons_upserted: 0, threads_upserted: 0, turns_seen: 0, turns_skipped: 0, observations_created: 0,
  };

  // Buffer by thread so we ship one request per thread (per chunk) per sync.
  const byThread = new Map<string, CanonicalTurn[]>();
  for await (const chunk of opts.turns) {
    for (const t of chunk) {
      const arr = byThread.get(t.thread_id) ?? [];
      arr.push(t);
      byThread.set(t.thread_id, arr);
    }
  }

  if (opts.verbose) {
    process.stderr.write(`[sync] buffered ${byThread.size} distinct threads from chat-db generator\n`);
    process.stderr.write(`[sync] concurrency=${concurrency} chunk_size=${CHUNK_SIZE}\n`);
  }

  // Worker-pool over threads. Each worker pulls a thread off the queue,
  // posts every chunk for it sequentially (so a long thread's chunks
  // stay ordered), then grabs the next thread. Threads themselves run
  // in parallel up to `concurrency`.
  const queue: Array<[string, CanonicalTurn[]]> = [...byThread.entries()];

  async function postChunk(
    threadId: string,
    body: Record<string, unknown>,
  ): Promise<SyncResult> {
    let attempt = 0;
    while (true) {
      const res = await f(`${opts.apiBase}/api/me/connectors/conversations/turns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MCP-Key": opts.token,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return await res.json() as SyncResult;
      }
      const detail = await res.text();
      const retryAfter = parseRetryAfterSec(res.status, detail);
      if (retryAfter != null && attempt < MAX_D1_RETRIES) {
        attempt += 1;
        if (opts.verbose) {
          process.stderr.write(
            `[sync]   ${threadId}: ${res.status} busy, retry ${attempt}/${MAX_D1_RETRIES} in ${retryAfter}s\n`,
          );
        }
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(`cosmos rejected sync for thread ${threadId}: ${res.status} ${detail}`);
    }
  }

  async function postOneThread(threadId: string, turns: CanonicalTurn[]): Promise<void> {
    if (opts.verbose) {
      process.stderr.write(`[sync] thread ${threadId} · ${turns.length} turns\n`);
    }
    const participantHandles = Array.from(new Set([
      "self",
      ...turns[0]?.participants ?? [],
      ...turns.map((t) => t.from_handle),
    ])).filter((h) => h !== "unknown");

    const participants = participantHandles.map((handle) => {
      if (handle === "self") return { handle, is_self: true };
      const meta = opts.state.handles[handle];
      return { handle, is_self: false, name: meta?.name };
    });
    const participantCount = Math.max(
      participantHandles.length,
      ...turns.map((t) => Number(t.participant_count || 0)),
    );

    for (let i = 0; i < turns.length; i += CHUNK_SIZE) {
      const slice = turns.slice(i, i + CHUNK_SIZE).map((t) => ({
        turn_id: t.turn_id,
        from_handle: t.from_handle,
        occurred_at: t.occurred_at,
        // Message text rides along now that the server stores it and
        // runs observation extraction over the transcript. Older syncs
        // were metadata-only; existing turn rows backfill text in place.
        text: t.text,
        // Links extracted from the message body, and attachment metadata
        // (photo / video / audio / pdf / sticker / link / file). The
        // extractor folds these into the transcript so the LLM can see
        // "[photo: IMG_4823.jpg, 2.1MB]" or "[link: https://...]" inline.
        ...(t.links && t.links.length ? { links: t.links } : {}),
        ...(t.attachments && t.attachments.length ? { attachments: t.attachments } : {}),
      }));
      const data = await postChunk(threadId, {
        source: "imessage",
        thread_id: threadId,
        participants,
        participant_count: participantCount,
        turns: slice,
        extract: "content",
      });
      if (opts.verbose) {
        const backfill = data.text_backfilled ?? 0;
        process.stderr.write(
          `[sync]   ${threadId} chunk ${i / CHUNK_SIZE + 1}: ` +
          `persons=${data.persons_upserted} threads=${data.threads_upserted} ` +
          `fresh=${data.turns_seen} skipped=${data.turns_skipped} ` +
          `text_backfilled=${backfill}\n`
        );
      }
      // JS is single-threaded; += on shared totals from interleaved
      // awaits is safe (no preemption mid-statement).
      totals.persons_upserted += data.persons_upserted;
      totals.threads_upserted += data.threads_upserted;
      totals.turns_seen += data.turns_seen;
      totals.turns_skipped += data.turns_skipped;
      totals.observations_created += data.observations_created;
      totals.text_backfilled = (totals.text_backfilled ?? 0) + (data.text_backfilled ?? 0);

      const lastTurn = slice[slice.length - 1];
      opts.state.threads[threadId] = {
        last_turn_id_synced: lastTurn.turn_id,
        participants: participantHandles,
      };
    }
  }

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await postOneThread(next[0], next[1]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  opts.state.last_sync_at = new Date().toISOString();
  return totals;
}
