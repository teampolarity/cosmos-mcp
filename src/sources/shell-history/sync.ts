// sync.ts — ship new shell commands as a single source_page per sync
// window. Each sync window becomes one row in source_pages, keyed by
// (source="shell-history", source_id="shell-history:<sync-iso>"). The
// body is the newline-joined commands; downstream extractors can pick
// out patterns ("user is debugging cosmos-fork" from `npx wrangler`
// calls, "user is writing Swift" from xcrun, etc.) without each
// individual command being its own node.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCommands, dedupeRun, isTrivial, type ShellCommand } from "./parse.js";
import type { ShellHistoryState } from "./state.js";

const DEFAULT_HISTORY_PATHS = [
  path.join(os.homedir(), ".zsh_history"),
  path.join(os.homedir(), ".bash_history"),
  path.join(os.homedir(), ".config", "fish", "fish_history"),
];

export interface SyncOptions {
  state: ShellHistoryState;
  apiBase: string;
  token: string;
  historyPath?: string;
  fetch?: typeof globalThis.fetch;
  verbose?: boolean;
  dryRun?: boolean;
}

export interface SyncResult {
  history_path: string;
  bytes_scanned: number;
  commands_read: number;
  commands_shipped: number;
  status: "created" | "updated" | "unchanged" | "skipped";
  node_id?: number;
}

export async function syncShellHistory(opts: SyncOptions): Promise<SyncResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const historyPath = opts.historyPath ?? pickHistoryPath();
  const empty: SyncResult = {
    history_path: historyPath ?? "",
    bytes_scanned: 0, commands_read: 0, commands_shipped: 0,
    status: "skipped",
  };
  if (!historyPath) {
    if (opts.verbose) process.stderr.write(`[shell-history] no history file found\n`);
    return empty;
  }
  if (!fs.existsSync(historyPath)) {
    if (opts.verbose) process.stderr.write(`[shell-history] ${historyPath} missing\n`);
    return empty;
  }

  const stat = fs.statSync(historyPath);

  // File shrank since last sync or the user switched shells → reset
  // the watermark. We accept some duplication on the server side (the
  // body_hash compare in _source_pages.js makes a re-shipped window a
  // no-op when the contents match).
  let sinceByte = opts.state.last_byte;
  if (opts.state.last_path && opts.state.last_path !== historyPath) sinceByte = 0;
  if (stat.size < sinceByte) sinceByte = 0;

  const all: ShellCommand[] = [];
  for (const cmd of readCommands(historyPath, sinceByte)) {
    if (isTrivial(cmd.command)) continue;
    all.push(cmd);
  }
  const commands = dedupeRun(all);
  if (opts.verbose) {
    process.stderr.write(
      `[shell-history] ${historyPath} · bytes ${sinceByte}..${stat.size} · ` +
      `${commands.length} commands after filter (from ${all.length} raw)\n`,
    );
  }

  if (commands.length === 0) {
    opts.state.last_byte = stat.size;
    opts.state.last_path = historyPath;
    opts.state.last_sync_at = new Date().toISOString();
    return { ...empty, history_path: historyPath, bytes_scanned: stat.size - sinceByte, status: "unchanged" };
  }

  // One source_page per sync window. The sync timestamp is part of the
  // source_id so re-running the same sync (same bytes) idempotently
  // updates the same row, and a fresh sync after new bytes lands a new
  // row. Body is the newline-joined commands.
  const syncedAt = new Date();
  const isoMinute = syncedAt.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const sourceId = `shell-history:${isoMinute}`;
  const body = commands.map((c) => c.command).join("\n");
  const title = `shell history · ${syncedAt.toISOString().slice(0, 10)} (${commands.length} commands)`;

  // Use any per-command timestamps to bracket the window; fall back to
  // the sync time when extended-history is off.
  const withTs = commands.filter((c) => c.ran_at_epoch !== null) as Array<ShellCommand & { ran_at_epoch: number }>;
  const sourceCreatedAt = withTs.length > 0
    ? new Date(Math.min(...withTs.map((c) => c.ran_at_epoch)) * 1000).toISOString()
    : syncedAt.toISOString();
  const sourceEditedAt = withTs.length > 0
    ? new Date(Math.max(...withTs.map((c) => c.ran_at_epoch)) * 1000).toISOString()
    : syncedAt.toISOString();

  if (opts.dryRun) {
    opts.state.last_byte = stat.size;
    opts.state.last_path = historyPath;
    opts.state.last_sync_at = syncedAt.toISOString();
    return {
      history_path: historyPath,
      bytes_scanned: stat.size - sinceByte,
      commands_read: all.length,
      commands_shipped: commands.length,
      status: "created",
    };
  }

  const principal = await whoami(f, opts.apiBase, opts.token);
  if (!principal) throw new Error("cosmos rejected the MCP key (whoami 401)");

  const res = await f(`${opts.apiBase}/api/polarity/source-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MCP-Key": opts.token },
    body: JSON.stringify({
      polarity_user_id: principal.polarity_user_id,
      source: "shell-history",
      source_id: sourceId,
      title,
      body_markdown: body,
      tags: ["shell"],
      source_created_at: sourceCreatedAt,
      source_edited_at: sourceEditedAt,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`cosmos rejected source-page: ${res.status} ${detail}`);
  }
  const data = await res.json() as { status?: string; node_id?: number };

  opts.state.last_byte = stat.size;
  opts.state.last_path = historyPath;
  opts.state.last_sync_at = syncedAt.toISOString();

  return {
    history_path: historyPath,
    bytes_scanned: stat.size - sinceByte,
    commands_read: all.length,
    commands_shipped: commands.length,
    status: (data.status as SyncResult["status"]) ?? "created",
    node_id: data.node_id,
  };
}

function pickHistoryPath(): string | null {
  for (const p of DEFAULT_HISTORY_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function whoami(
  fetchFn: typeof globalThis.fetch,
  apiBase: string,
  token: string,
): Promise<{ polarity_user_id: string } | null> {
  const res = await fetchFn(`${apiBase}/api/polarity/whoami`, {
    headers: { "X-MCP-Key": token, "User-Agent": "cosmos-mcp/shell-history" },
  });
  if (!res.ok) return null;
  const j = await res.json() as { polarity_user_id?: string };
  if (!j.polarity_user_id) return null;
  return { polarity_user_id: j.polarity_user_id };
}
