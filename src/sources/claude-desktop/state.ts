// state.ts — ~/.cosmos/claude-desktop-state.json. One row per session
// file we have seen, plus a top-level last_sync_at. Hand-editable; delete
// a session row to force a re-sync of just that file.

import fs from "node:fs";
import path from "node:path";

export interface SessionEntry {
  // Last turn uuid we successfully shipped for this session.
  last_uuid_synced: string;
  // Last observed file size in bytes. If the file shrank, the JSONL was
  // rotated or truncated and we re-read from the top.
  last_size_bytes: number;
  // ISO mtime when we last looked at this file.
  last_mtime: string;
  // ISO timestamp of the last turn we shipped (informational).
  last_turn_at?: string;
  // Working directory the session ran in (preserved for /me display).
  cwd?: string;
}

export interface ClaudeDesktopState {
  last_sync_at: string | null;
  sessions: Record<string, SessionEntry>;
}

export function defaultState(): ClaudeDesktopState {
  return { last_sync_at: null, sessions: {} };
}

export function defaultPath(): string {
  return path.join(process.env.HOME || ".", ".cosmos", "claude-desktop-state.json");
}

export function loadState(filePath: string): ClaudeDesktopState {
  if (!fs.existsSync(filePath)) return defaultState();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    // Corrupt state should not block a sync. The next successful write
    // overwrites it; meanwhile we re-scan everything (safe; turn_id is the
    // server-side dedup key, not the client watermark).
    return defaultState();
  }
}

export function saveState(filePath: string, state: ClaudeDesktopState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
