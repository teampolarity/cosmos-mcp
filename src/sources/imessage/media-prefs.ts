// media-prefs.ts — fetch/push iMessage photo privacy prefs from cosmos.

import type { ImessageState } from "./state.js";

export interface MediaPrefs {
  propose_photos?: boolean;
  caption_mode: "off" | "server" | "local";
  skip_kinds: string[];
  sender_rules?: Record<string, { caption?: boolean; propose?: boolean }>;
  thread_rules?: Record<string, { caption?: boolean; propose?: boolean }>;
}

export async function fetchMediaPrefs(
  apiBase: string,
  token: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<MediaPrefs> {
  const res = await fetchImpl(`${apiBase}/api/me/connectors/imessage/media`, {
    headers: { "X-MCP-Key": token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`media prefs fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as MediaPrefs;
}

export function rulesFromLocalState(state: ImessageState) {
  const sender_rules: Record<string, { caption?: boolean; propose?: boolean }> = {};
  for (const [handle, meta] of Object.entries(state.handles || {})) {
    const rule: { caption?: boolean; propose?: boolean } = {};
    if (meta.caption_images === false) rule.caption = false;
    if (meta.propose_photos === false) rule.propose = false;
    if (Object.keys(rule).length) sender_rules[handle] = rule;
  }
  const thread_rules: Record<string, { caption?: boolean; propose?: boolean }> = {};
  for (const [threadId, meta] of Object.entries(state.threads || {})) {
    const rule: { caption?: boolean; propose?: boolean } = {};
    if (meta.caption_images === false) rule.caption = false;
    if (meta.propose_photos === false) rule.propose = false;
    if (Object.keys(rule).length) thread_rules[threadId] = rule;
  }
  return { sender_rules, thread_rules };
}

export async function pushMediaRulesFromState(
  apiBase: string,
  token: string,
  state: ImessageState,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<void> {
  const { sender_rules, thread_rules } = rulesFromLocalState(state);
  if (!Object.keys(sender_rules).length && !Object.keys(thread_rules).length) return;
  await fetchImpl(`${apiBase}/api/me/connectors/imessage/media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-MCP-Key": token },
    body: JSON.stringify({ sender_rules, thread_rules }),
  }).catch(() => {});
}

export function localAllowsCaption(
  state: ImessageState, 
  item: { thread_id?: string; from_handle?: string }
): boolean {
  if (item.thread_id) {
    const t = state.threads[item.thread_id] as ThreadEntryWithMedia | undefined;
    if (t?.caption_images === false) return false;
  }
  if (item.from_handle) {
    const h = state.handles[item.from_handle] as HandleEntryWithMedia | undefined;
    if (h?.caption_images === false) return false;
  }
  return true;
}

interface HandleEntryWithMedia {
  caption_images?: boolean;
  propose_photos?: boolean;
}

interface ThreadEntryWithMedia {
  caption_images?: boolean;
  propose_photos?: boolean;
}
