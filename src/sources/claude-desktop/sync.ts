// sync.ts — discovers Claude Code session JSONL files under
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl, parses new turns
// since the last watermark, and ships them to cosmos as one POST per
// session. Source string is "claude-desktop" because that is the
// user-facing surface (Claude Code in Desktop, plus the desktop chat
// surface once that becomes watchable).

import fs from "node:fs";
import path from "node:path";
import { readTurns, type CanonicalTurn } from "./parse.js";
import type { ClaudeDesktopState, SessionEntry } from "./state.js";

const DEFAULT_PROJECTS_DIR = path.join(process.env.HOME || ".", ".claude", "projects");
const DEFAULT_CONCURRENCY = 4;
const CHUNK_SIZE = 2000;

// Slop filter, mirroring the iMessage source's three-rule pattern. Skip
// sessions that are not user-Claude conversations. Today: claude-mem's
// observer-sessions, which are programmatic memory-extraction prompts
// fired by background hooks, not real exchanges. The session file's path
// (encoded cwd) is the cheapest signal; the cwd field inside the events
// confirms.
const SLOP_PATH_PATTERNS = [
  /-claude-mem-observer-sessions/,
  /claude-mem\/observer-sessions/,
];
function isSlopSession(filePath: string, sampleCwd?: string): boolean {
  if (SLOP_PATH_PATTERNS.some((re) => re.test(filePath))) return true;
  if (sampleCwd && SLOP_PATH_PATTERNS.some((re) => re.test(sampleCwd))) return true;
  return false;
}

// Pick a label from the session's cwd. Strips the user's home prefix
// and returns the last 1-2 segments — "cosmos-mcp" is enough on its
// own, but "projects" alone is meaningless without "projects/cosmos-fork".
function cwdToLabel(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const home = process.env.HOME || "";
  const trimmed = home && cwd.startsWith(home + "/") ? cwd.slice(home.length + 1) : cwd;
  const segs = trimmed.split("/").filter(Boolean);
  if (segs.length === 0) return undefined;
  if (segs.length === 1) return segs[0];
  return segs.slice(-2).join("/");
}

export interface SyncOptions {
  projectsDir?: string;
  state: ClaudeDesktopState;
  apiBase: string;
  token: string;
  fetch?: typeof globalThis.fetch;
  verbose?: boolean;
  concurrency?: number;
  // If set, ship nothing — just report what would be shipped. Lets the
  // user validate the first sync on a noisy machine without committing.
  dryRun?: boolean;
  // Optional cutoff. Sessions with no turns after this point are skipped
  // entirely. Useful for incremental syncs that intentionally ignore old
  // history.
  sinceTimestamp?: string;
}

export interface SyncResult {
  sessions_scanned: number;
  sessions_shipped: number;
  turns_seen: number;
  turns_skipped: number;
  persons_upserted: number;
  threads_upserted: number;
  text_backfilled: number;
}

// Walk projectsDir/*/* .jsonl. Returns absolute paths sorted by mtime
// ascending so older files post first (the conversation_turns endpoint
// is order-independent server-side, but ascending mtime is friendlier
// for a verbose log to read along to).
export function listSessionFiles(projectsDir: string): string[] {
  if (!fs.existsSync(projectsDir)) return [];
  const out: Array<{ p: string; m: number }> = [];
  for (const project of fs.readdirSync(projectsDir)) {
    const projectPath = path.join(projectsDir, project);
    let stat: fs.Stats;
    try { stat = fs.statSync(projectPath); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(projectPath)) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = path.join(projectPath, entry);
      try {
        const s = fs.statSync(filePath);
        if (!s.isFile()) continue;
        out.push({ p: filePath, m: s.mtimeMs });
      } catch { /* skip */ }
    }
  }
  out.sort((a, b) => a.m - b.m);
  return out.map((x) => x.p);
}

export async function syncClaudeDesktop(opts: SyncOptions): Promise<SyncResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const projectsDir = opts.projectsDir ?? DEFAULT_PROJECTS_DIR;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const totals: SyncResult = {
    sessions_scanned: 0, sessions_shipped: 0,
    turns_seen: 0, turns_skipped: 0,
    persons_upserted: 0, threads_upserted: 0, text_backfilled: 0,
  };

  const files = listSessionFiles(projectsDir);
  if (opts.verbose) {
    process.stderr.write(`[claude-desktop] ${files.length} session files under ${projectsDir}\n`);
  }

  const queue: string[] = [...files];

  async function postOneSession(filePath: string): Promise<void> {
    totals.sessions_scanned++;
    if (isSlopSession(filePath)) {
      if (opts.verbose) {
        process.stderr.write(`[claude-desktop]   ${path.basename(filePath)} slop, skip\n`);
      }
      return;
    }
    const fileStat = fs.statSync(filePath);
    const sessionId = path.basename(filePath, ".jsonl");
    const existing: SessionEntry | undefined = opts.state.sessions[sessionId];

    // File shrank → log-rotation or truncation; resync from the top.
    const fileShrank = existing && fileStat.size < existing.last_size_bytes;
    const sinceUuid = fileShrank ? undefined : existing?.last_uuid_synced;

    // No new bytes since last watch and we have a watermark → fast skip.
    if (existing && fileStat.size === existing.last_size_bytes && existing.last_uuid_synced) {
      if (opts.verbose) {
        process.stderr.write(`[claude-desktop]   ${sessionId} unchanged, skip\n`);
      }
      return;
    }

    // Buffer turns first; we want to ship one POST per session (chunked
    // if a backfill yields >CHUNK_SIZE turns). Streaming directly to the
    // network would split sessions awkwardly when one chunk fails.
    const buffered: CanonicalTurn[] = [];
    for await (const t of readTurns({
      filePath, sinceUuid, sinceTimestamp: opts.sinceTimestamp,
    })) {
      buffered.push(t);
    }

    if (buffered.length === 0) {
      // Watermark caught up but file size grew (e.g. tool_use blocks
      // were appended, which we strip). Advance the size watermark so
      // the next sync doesn't re-read the same bytes.
      if (existing) {
        opts.state.sessions[sessionId] = {
          ...existing,
          last_size_bytes: fileStat.size,
          last_mtime: new Date(fileStat.mtimeMs).toISOString(),
        };
      }
      return;
    }

    if (opts.verbose) {
      process.stderr.write(`[claude-desktop]   ${sessionId} · ${buffered.length} new turns\n`);
    }

    if (opts.dryRun) {
      totals.turns_seen += buffered.length;
      totals.sessions_shipped++;
      return;
    }

    // Claude is the source surface, not a counterpart — same way iMessage
    // doesn't get a "Messages.app" person. Only `self` is a participant.
    // The assistant turns still record from_handle="claude" as a row
    // label so the server-side extractor can attribute speaker.
    const participants = [{ handle: "self", is_self: true }];

    // Derive a thread label from the session's working directory and
    // git branch (when present). The leaf alone is often generic
    // ("projects", "observer-sessions"); last-two-segments gives the
    // context that matters ("projects/cosmos-mcp"). Plus the branch
    // when it isn't HEAD or main, since branch-named work is the part
    // worth surfacing.
    const sample = buffered.find((t) => t.cwd) ?? buffered[0];
    const cwdLabel = cwdToLabel(sample.cwd);
    const branch = sample.git_branch && sample.git_branch !== "HEAD" && sample.git_branch !== "main"
      ? sample.git_branch
      : undefined;
    const threadLabel = cwdLabel
      ? (branch ? `${cwdLabel} · ${branch}` : cwdLabel)
      : `claude-desktop:${sessionId.slice(0, 8)}`;

    for (let i = 0; i < buffered.length; i += CHUNK_SIZE) {
      const slice = buffered.slice(i, i + CHUNK_SIZE);
      const payloadTurns = slice.map((t) => ({
        turn_id: t.turn_id,
        from_handle: t.from_handle,
        occurred_at: t.occurred_at,
        text: t.text,
      }));
      const res = await f(`${opts.apiBase}/api/me/connectors/conversations/turns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MCP-Key": opts.token,
        },
        body: JSON.stringify({
          source: "claude-desktop",
          thread_id: sessionId,
          thread_label: threadLabel,
          participants,
          turns: payloadTurns,
          extract: "content",
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`cosmos rejected sync for session ${sessionId}: ${res.status} ${detail}`);
      }
      const data = await res.json() as Partial<SyncResult> & {
        persons_upserted?: number; threads_upserted?: number;
        turns_seen?: number; turns_skipped?: number; text_backfilled?: number;
      };
      totals.persons_upserted += data.persons_upserted ?? 0;
      totals.threads_upserted += data.threads_upserted ?? 0;
      totals.turns_seen += data.turns_seen ?? 0;
      totals.turns_skipped += data.turns_skipped ?? 0;
      totals.text_backfilled += data.text_backfilled ?? 0;

      const lastTurn = slice[slice.length - 1];
      opts.state.sessions[sessionId] = {
        last_uuid_synced: lastTurn.turn_id,
        last_size_bytes: fileStat.size,
        last_mtime: new Date(fileStat.mtimeMs).toISOString(),
        last_turn_at: lastTurn.occurred_at,
        cwd: lastTurn.cwd,
      };
    }
    totals.sessions_shipped++;
  }

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      try {
        await postOneSession(next);
      } catch (e) {
        // Surface the failure but keep going. Worst case one session
        // is skipped this tick; the next tick re-tries from the same
        // watermark since we only advance on success.
        process.stderr.write(`[claude-desktop] ${path.basename(next)} failed: ${(e as Error).message}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  opts.state.last_sync_at = new Date().toISOString();
  return totals;
}
