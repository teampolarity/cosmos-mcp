// state.ts — read/write ~/.cosmos/imessage-state.json. Human-readable,
// hand-editable. Single source of truth for "what have we synced and
// who is who" on the client side.

import fs from "node:fs";
import path from "node:path";

export interface HandleEntry {
  name?: string;
  content_enabled: boolean;
  role?: string;
}

export interface ThreadEntry {
  last_turn_id_synced: string;
  participants: string[];
}

export interface ImessageState {
  last_sync_at: string | null;
  window_start_at: string | null;
  handles: Record<string, HandleEntry>;
  threads: Record<string, ThreadEntry>;
}

export function defaultState(): ImessageState {
  return { last_sync_at: null, window_start_at: null, handles: {}, threads: {} };
}

export function defaultPath(): string {
  return path.join(process.env.HOME || ".", ".cosmos", "imessage-state.json");
}

export function loadState(filePath: string): ImessageState {
  if (!fs.existsSync(filePath)) return defaultState();
  const raw = fs.readFileSync(filePath, "utf8");
  return { ...defaultState(), ...JSON.parse(raw) };
}

export function saveState(filePath: string, state: ImessageState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
