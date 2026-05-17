// sync.ts — drives a chat-db read through to the cosmos endpoint.
// Groups turns by thread, applies state's handle->name map to enrich
// participants, posts each thread's slice as one request, updates
// state on success.

import { CanonicalTurn } from "./chat-db.js";
import { ImessageState } from "./state.js";

export interface SyncOptions {
  turns: AsyncGenerator<CanonicalTurn[]>;
  state: ImessageState;
  apiBase: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}

export interface SyncResult {
  persons_upserted: number;
  threads_upserted: number;
  turns_seen: number;
  turns_skipped: number;
  observations_created: number;
}

export async function syncImessage(opts: SyncOptions): Promise<SyncResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const totals: SyncResult = {
    persons_upserted: 0, threads_upserted: 0, turns_seen: 0, turns_skipped: 0, observations_created: 0,
  };

  // Buffer by thread so we ship one request per thread per sync.
  // Threads longer than 500 turns split into multiple chronological chunks.
  const byThread = new Map<string, CanonicalTurn[]>();
  for await (const chunk of opts.turns) {
    for (const t of chunk) {
      const arr = byThread.get(t.thread_id) ?? [];
      arr.push(t);
      byThread.set(t.thread_id, arr);
    }
  }

  for (const [threadId, turns] of byThread) {
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

    for (let i = 0; i < turns.length; i += 500) {
      const slice = turns.slice(i, i + 500).map((t) => ({
        turn_id: t.turn_id,
        from_handle: t.from_handle,
        occurred_at: t.occurred_at,
      }));
      const res = await f(`${opts.apiBase}/api/me/connectors/conversations/turns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${opts.token}`,
        },
        body: JSON.stringify({
          source: "imessage",
          thread_id: threadId,
          participants,
          turns: slice,
          extract: "metadata",
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`cosmos rejected sync for thread ${threadId}: ${res.status} ${detail}`);
      }
      const data = await res.json() as SyncResult;
      totals.persons_upserted += data.persons_upserted;
      totals.threads_upserted += data.threads_upserted;
      totals.turns_seen += data.turns_seen;
      totals.turns_skipped += data.turns_skipped;
      totals.observations_created += data.observations_created;

      const lastTurn = slice[slice.length - 1];
      opts.state.threads[threadId] = {
        last_turn_id_synced: lastTurn.turn_id,
        participants: participantHandles,
      };
    }
  }

  opts.state.last_sync_at = new Date().toISOString();
  return totals;
}
