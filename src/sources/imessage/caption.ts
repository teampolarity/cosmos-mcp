// caption.ts — runs vision captioning over un-captioned iMessage
// photos and videos in the user's cosmos graph.
//
// Flow:
//   1. GET /api/me/connectors/conversations/caption?limit=N to fetch
//      the work queue: turn_id + attachment_index pairs that don't
//      have a caption yet.
//   2. For each item, re-open chat.db, look up the message guid from
//      the turn_id, find the attachment row, read the file from disk.
//   3. POST base64 bytes to the same endpoint. The server runs the
//      Workers AI vision model and writes the caption back to the
//      conversation_turns row.
//
// The CLI is the only side that touches the user's local file system.
// The server never sees a filesystem path, only the bytes (already
// base64-encoded) and metadata.

import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { ImessageState } from "./state.js";
import type { MediaPrefs } from "./media-prefs.js";

interface QueueItem {
  turn_id: string;
  attachment_index: number;
  kind: string;
  mime: string | null;
  filename: string | null;
  bytes: number | null;
}

interface CaptionState {
  apiBase: string;
  token: string;
  dbPath: string;
  limit: number;
  maxItems: number | null;
  verbose: boolean;
  recaption: boolean;
  fetch: typeof globalThis.fetch;
  delayMs: number;
  progress: boolean;
}

export interface CaptionOptions {
  apiBase: string;
  token: string;
  dbPath: string;
  limit?: number;
  maxItems?: number | null;
  verbose?: boolean;
  recaption?: boolean;
  fetch?: typeof globalThis.fetch;
  delayMs?: number;
  progress?: boolean;
  captionMode?: MediaPrefs["caption_mode"];
  skipKinds?: string[];
  imessageState?: ImessageState | null;
}

export interface CaptionTotals {
  processed: number;
  captioned: number;
  skipped: number;
  failed: number;
}

// Skip files larger than this. Workers AI vision wants images you can
// hold in memory; a 50MB Live Photo or a 4K video frame is overkill
// and burns neurons. Captioning a thumbnail or any reasonable photo
// gives equivalent quality.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Sleep between requests so we don't hammer the AI gateway. 300ms is
// well under the 60 RPS Workers AI free tier ceiling and gives the
// model time to respond.
const PER_REQUEST_DELAY_MS = 300;

export async function runCaptionCli(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const dbPath = process.env.COSMOS_IMESSAGE_DB || path.join(os.homedir(), "Library", "Messages", "chat.db");
  // Prefer the cached token file (mint via `cosmos-mcp init`). Env
  // vars are honored for CI / scripted runs. Same priority order as
  // the sync subcommand and the MCP server itself.
  const { loadConfig, UNCONFIGURED_MESSAGE } = await import("../../config.js");
  const cfg = loadConfig();
  const token = process.env.COSMOS_TOKEN || process.env.COSMOS_MCP_KEY || cfg?.authToken || "";
  const apiBase = process.env.COSMOS_URL || cfg?.cosmosUrl || "https://cosmos.polarity-lab.com";
  if (!token) {
    process.stderr.write(`error: ${UNCONFIGURED_MESSAGE}\n`);
    return 2;
  }

  process.stdout.write(`cosmos · iMessage captioning · queue limit ${flags.limit}${flags.recaption ? ' · RECAPTION mode (overwrites existing)' : ''}\n`);

  const totals = await captionImessageAttachments({
    apiBase,
    token,
    dbPath,
    limit: flags.limit,
    maxItems: null,
    verbose: flags.verbose,
    recaption: flags.recaption,
    fetch: globalThis.fetch,
    delayMs: PER_REQUEST_DELAY_MS,
    progress: true,
  });
  process.stdout.write(`done · ${totals.captioned} captioned · ${totals.skipped} skipped · ${totals.failed} failed\n`);
  return 0;
}

export async function captionImessageAttachments(opts: CaptionOptions): Promise<CaptionTotals> {
  const state: CaptionState = {
    apiBase: opts.apiBase,
    token: opts.token,
    dbPath: opts.dbPath,
    limit: opts.limit ?? 50,
    maxItems: opts.maxItems ?? null,
    verbose: !!opts.verbose,
    recaption: !!opts.recaption,
    fetch: opts.fetch ?? globalThis.fetch,
    delayMs: opts.delayMs ?? PER_REQUEST_DELAY_MS,
    progress: !!opts.progress,
  };

  // One persistent chat.db connection. We re-query for every item but
  // the OS page cache makes lookups effectively free after the first.
  const db = new Database(state.dbPath, { readonly: true, fileMustExist: true });
  try {
    const totals: CaptionTotals = { processed: 0, captioned: 0, skipped: 0, failed: 0 };

    while (true) {
      if (state.maxItems != null && totals.processed >= state.maxItems) return totals;
      const queue = await fetchQueue(state);
      if (queue.length === 0) return totals;
      if (state.verbose) {
        process.stderr.write(`[caption] pulled ${queue.length} items from queue\n`);
      }

      for (const item of queue) {
        if (state.maxItems != null && totals.processed >= state.maxItems) return totals;
        totals.processed++;
        try {
          const result = await captionOne(db, state, item);
          if (result === "captioned") totals.captioned++;
          else if (result === "skipped") totals.skipped++;
          if (state.progress && totals.processed % 10 === 0) {
            process.stdout.write(`  ${totals.captioned} captioned, ${totals.skipped} skipped, ${totals.failed} failed (of ${totals.processed})\n`);
          }
        } catch (e) {
          totals.failed++;
          if (state.verbose) {
            process.stderr.write(`[caption] failed ${item.turn_id}[${item.attachment_index}]: ${(e as Error).message}\n`);
          }
        }
        if (state.delayMs > 0) await sleep(state.delayMs);
      }
    }
  } finally {
    db.close();
  }
}

async function fetchQueue(state: CaptionState): Promise<QueueItem[]> {
  const qs = `limit=${state.limit}${state.recaption ? '&all=1' : ''}`;
  const url = `${state.apiBase}/api/me/connectors/conversations/caption?${qs}`;
  const res = await state.fetch(url, { headers: { "X-MCP-Key": state.token } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`queue fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { items?: QueueItem[] };
  return data.items || [];
}

async function captionOne(
  db: Database.Database,
  state: CaptionState,
  item: QueueItem,
): Promise<"captioned" | "skipped"> {
  // Resolve turn_id → message_guid → attachment.filename. Apple stores
  // the full path in attachment.filename (already absolute, with ~ when
  // the message DB was migrated from a Time Machine restore). We expand
  // ~ and pass through.
  const guid = item.turn_id.startsWith("imessage:") ? item.turn_id.slice("imessage:".length) : item.turn_id;

  // The CLI orders attachments by maj.ROWID ascending to match how the
  // sync ordered them. Apple does not guarantee insertion order across
  // joins, but maj is monotonic, so this is the same view both sides
  // see. attachment_index is therefore the 0-based position in that
  // ordered list.
  const rows = db.prepare(`
    SELECT a.filename AS filename, a.mime_type AS mime_type, a.total_bytes AS total_bytes
    FROM attachment a
    JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
    JOIN message m ON m.ROWID = maj.message_id
    WHERE m.guid = ?
    ORDER BY maj.ROWID ASC
  `).all(guid) as Array<{ filename: string | null; mime_type: string | null; total_bytes: bigint | number | null }>;

  if (item.attachment_index >= rows.length) {
    if (state.verbose) process.stderr.write(`[caption] no attachment at index ${item.attachment_index} for ${item.turn_id}\n`);
    await markFailed(state, item, 'attachment_missing');
    return "skipped";
  }
  const row = rows[item.attachment_index];
  if (!row.filename) {
    await markFailed(state, item, 'missing_filename');
    return "skipped";
  }

  const filepath = expandHome(row.filename);
  let bytes: Buffer;
  let mime = row.mime_type || item.mime || guessMime(filepath);
  try {
    const stat = await fs.stat(filepath);
    if (stat.size > MAX_FILE_BYTES) {
      if (state.verbose) process.stderr.write(`[caption] ${filepath} too large (${stat.size}B), skipping\n`);
      await markFailed(state, item, 'too_large');
      return "skipped";
    }
    bytes = await fs.readFile(filepath);
  } catch (e) {
    // File may have been deleted, expired (iCloud-evicted), or never
    // downloaded to this Mac. Common case, not an error.
    if (state.verbose) process.stderr.write(`[caption] cannot read ${filepath}: ${(e as Error).message}\n`);
    await markFailed(state, item, 'file_unavailable');
    return "skipped";
  }

  // HEIC conversion. Anthropic's vision API only accepts jpeg, png, gif,
  // webp. iPhone photos default to HEIC, which the API rejects with a
  // 502 from the gateway (no useful body for the CLI to parse). Convert
  // locally with macOS's built-in `sips` so we ship a JPEG and the
  // server's mime stays in the supported set. If sips is missing or
  // fails (Linux, or a corrupt HEIC), we skip rather than burn the
  // request.
  const isHeic = /\.heic$/i.test(filepath) || mime === 'image/heic' || mime === 'image/heif';
  if (isHeic) {
    try {
      const tmpJpg = path.join(os.tmpdir(), `cosmos-caption-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', filepath, '--out', tmpJpg], { stdio: 'ignore' });
      bytes = await fs.readFile(tmpJpg);
      mime = 'image/jpeg';
      try { await fs.unlink(tmpJpg); } catch { /* tmp file, ignore */ }
    } catch (e) {
      if (state.verbose) process.stderr.write(`[caption] HEIC convert failed for ${filepath}: ${(e as Error).message}\n`);
      // Mark on the server so this attachment stops re-queueing.
      await markFailed(state, item, 'heic_convert_failed');
      return "skipped";
    }
  }

  const b64 = bytes.toString("base64");

  const res = await state.fetch(`${state.apiBase}/api/me/connectors/conversations/caption`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MCP-Key": state.token },
    body: JSON.stringify({
      turn_id: item.turn_id,
      attachment_index: item.attachment_index,
      image_b64: b64,
      mime,
      force: state.recaption,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // Mark on the server so the queue stops re-serving this attachment.
    // Without this marker, every queue pull re-includes the same
    // permanently-failing images and the CLI burns time on them.
    const reason = (res.status === 413) ? 'too_large'
      : (text.includes('Could not process image') || text.includes('image/heic')) ? 'unsupported_format'
      : `upstream_${res.status}`;
    await markFailed(state, item, reason);
    throw new Error(`caption POST failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { caption?: string; cached?: boolean };
  if (state.verbose && data.caption) {
    process.stderr.write(`[caption] ${item.turn_id}[${item.attachment_index}]: ${data.caption.slice(0, 120)}\n`);
  }
  return "captioned";
}

// POST to the same endpoint with a `mark_failed` flag instead of an
// image. The server writes `caption_error: <reason>` into the
// attachment JSON. The GET queue excludes anything with caption OR
// caption_error set, so this attachment stops re-appearing on every
// run. Idempotent.
async function markFailed(state: CaptionState, item: QueueItem, reason: string): Promise<void> {
  try {
    await state.fetch(`${state.apiBase}/api/me/connectors/conversations/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MCP-Key": state.token },
      body: JSON.stringify({
        turn_id: item.turn_id,
        attachment_index: item.attachment_index,
        mark_failed: reason,
      }),
    });
  } catch { /* best-effort; the queue exclusion is a soft optimization */ }
}

function parseFlags(argv: string[]): { limit: number; verbose: boolean; recaption: boolean } {
  const verbose = argv.includes("--verbose") || argv.includes("-v");
  const recaption = argv.includes("--recaption");
  const limitIdx = argv.findIndex((a) => a === "--limit" || a === "-n");
  const limit = limitIdx >= 0 && argv[limitIdx + 1] ? Math.max(1, Math.min(500, Number(argv[limitIdx + 1]) || 50)) : 50;
  return { limit, verbose, recaption };
}

function expandHome(p: string): string {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

function guessMime(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".heic") return "image/heic";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
