// parse.ts — read ~/.zsh_history (or any plain-text history file) and
// yield meaningful commands. zsh writes either plain command lines OR
// extended-history lines (": <epoch>:<elapsed>;<command>") depending
// on whether EXTENDED_HISTORY is set. Both forms are handled.
//
// Multi-line commands end in a trailing backslash. zsh writes the
// continuation on the next file line; we join them back together so
// the canonical command matches what the user actually typed.

import fs from "node:fs";

export interface ShellCommand {
  // Raw command, multi-line joined back together.
  command: string;
  // Epoch seconds if extended-history; null otherwise (plain mode).
  ran_at_epoch: number | null;
}

const EXTENDED_RE = /^:\s*(\d+):\d+;(.*)$/;

// Trivial-noise filter, mirroring the slop-filter pattern other sources
// use. Singleton commands ("ls", "pwd", "cd ..") accumulate fast and
// drown the real signal. The graph wants intent, not file system tics.
const TRIVIAL = new Set([
  "ls", "ls -la", "ll", "la", "pwd", "clear", "cls", "exit",
  "cd", "cd ..", "cd -", "cd ~", "cd /",
  "history", "fg", "bg", "jobs",
  "y", "n", "yes", "no",
]);

export function isTrivial(command: string): boolean {
  const c = command.trim();
  if (c.length === 0) return true;
  if (c.length < 3) return true;
  if (TRIVIAL.has(c.toLowerCase())) return true;
  return false;
}

// Streams the file from `sinceByte` and yields parsed commands. The
// caller advances its watermark to the final file size on success.
export function* readCommands(filePath: string, sinceByte = 0): Generator<ShellCommand> {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  const start = Math.min(sinceByte, stat.size);
  const fd = fs.openSync(filePath, "r");
  const length = stat.size - start;
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, start);
  fs.closeSync(fd);
  // Some zsh history files use UTF-8 with meta-bytes for non-ASCII
  // (zsh's HIST_META_BYTE escape). For v1 we decode as utf8 and accept
  // some garbled non-ASCII; the alternative is shipping a heavier
  // decoder for marginal payoff.
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  let pending: { ts: number | null; partial: string } | null = null;
  for (const raw of lines) {
    if (raw.length === 0) continue;
    let ts: number | null = null;
    let body = raw;
    const m = EXTENDED_RE.exec(raw);
    if (m) {
      ts = parseInt(m[1], 10);
      body = m[2];
    }
    const endsWithBackslash = body.endsWith("\\");
    if (pending) {
      pending.partial += "\n" + (endsWithBackslash ? body.slice(0, -1) : body);
      if (!endsWithBackslash) {
        const cmd = pending.partial.trim();
        if (cmd) yield { command: cmd, ran_at_epoch: pending.ts };
        pending = null;
      }
      continue;
    }
    if (endsWithBackslash) {
      pending = { ts, partial: body.slice(0, -1) };
      continue;
    }
    const cmd = body.trim();
    if (cmd) yield { command: cmd, ran_at_epoch: ts };
  }
  if (pending) {
    const cmd = pending.partial.trim();
    if (cmd) yield { command: cmd, ran_at_epoch: pending.ts };
  }
}

// Dedupe within a single sync window. Same command repeated in
// succession is one signal, not ten. Keep the last occurrence so the
// recency window reflects the most-recent run.
export function dedupeRun(commands: ShellCommand[]): ShellCommand[] {
  const out: ShellCommand[] = [];
  let lastCommand: string | null = null;
  for (const c of commands) {
    if (c.command === lastCommand) {
      if (out.length > 0) out[out.length - 1] = c;
    } else {
      out.push(c);
      lastCommand = c.command;
    }
  }
  return out;
}
