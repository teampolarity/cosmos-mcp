// state.ts — ~/.cosmos/shell-history-state.json. Single watermark:
// byte offset into the history file we've already shipped. If the file
// shrinks (rotation, `history -c`, manual prune), reset to 0.

import fs from "node:fs";
import path from "node:path";

export interface ShellHistoryState {
  last_byte: number;
  last_sync_at: string | null;
  last_path: string | null;
}

export function defaultState(): ShellHistoryState {
  return { last_byte: 0, last_sync_at: null, last_path: null };
}

export function defaultPath(): string {
  return path.join(process.env.HOME || ".", ".cosmos", "shell-history-state.json");
}

export function loadState(filePath: string): ShellHistoryState {
  if (!fs.existsSync(filePath)) return defaultState();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function saveState(filePath: string, state: ShellHistoryState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
