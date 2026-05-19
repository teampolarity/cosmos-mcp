// cli.ts — `cosmos-mcp claude-desktop <sync|status>` entrypoint.
//
// sync   — read ~/.claude/projects/*/* .jsonl, ship new turns to cosmos
// status — print where the state lives and what we know about each session

import path from "node:path";
import { defaultPath, loadState, saveState } from "./state.js";
import { syncClaudeDesktop, listSessionFiles } from "./sync.js";

function parseStringFlag(rest: string[], name: string): string | undefined {
  const eq = rest.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = rest.indexOf(name);
  if (idx >= 0 && rest[idx + 1]) return rest[idx + 1];
  return undefined;
}

function parseIntFlag(rest: string[], name: string): number | undefined {
  const s = parseStringFlag(rest, name);
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function runClaudeDesktopCli(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const verbose = rest.includes("--verbose") || rest.includes("-v");
  const dryRun = rest.includes("--dry-run");
  const projectsDir = parseStringFlag(rest, "--projects-dir");
  const sinceFlag = parseStringFlag(rest, "--since");
  const concurrency = parseIntFlag(rest, "--concurrency");
  switch (sub) {
    case "sync": return runSync({ verbose, dryRun, projectsDir, sinceFlag, concurrency });
    case "status": return runStatus({ projectsDir });
    default:
      process.stderr.write(
        `Usage: cosmos-mcp claude-desktop <sync|status> [flags]\n` +
        `  --verbose            log per-session detail\n` +
        `  --dry-run            scan and report; do not ship\n` +
        `  --since YYYY-MM-DD   skip turns older than this date\n` +
        `  --projects-dir PATH  override ~/.claude/projects\n` +
        `  --concurrency N      parallel sessions (default 4)\n`,
      );
      return 1;
  }
}

interface SyncFlags {
  verbose: boolean;
  dryRun: boolean;
  projectsDir?: string;
  sinceFlag?: string;
  concurrency?: number;
}

async function runSync(flags: SyncFlags): Promise<number> {
  const apiBase = process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";
  const { loadConfig, UNCONFIGURED_MESSAGE } = await import("../../config.js");
  const cfg = loadConfig();
  const token = process.env.COSMOS_TOKEN || cfg?.authToken || "";
  if (!token) {
    process.stderr.write(`error: ${UNCONFIGURED_MESSAGE}\n`);
    return 1;
  }
  const statePath = defaultPath();
  const state = loadState(statePath);

  let sinceTimestamp: string | undefined;
  if (flags.sinceFlag) {
    const parsed = new Date(flags.sinceFlag);
    if (isNaN(parsed.getTime())) {
      process.stderr.write(`error: --since "${flags.sinceFlag}" is not a valid date\n`);
      return 1;
    }
    sinceTimestamp = parsed.toISOString();
  }

  process.stdout.write(`cosmos · Claude Desktop sync${flags.dryRun ? " (dry-run)" : ""}\n`);
  try {
    const result = await syncClaudeDesktop({
      state, apiBase, token,
      projectsDir: flags.projectsDir,
      verbose: flags.verbose,
      dryRun: flags.dryRun,
      sinceTimestamp,
      concurrency: flags.concurrency,
    });
    if (!flags.dryRun) saveState(statePath, state);
    process.stdout.write(
      `\n  ${result.sessions_scanned} sessions scanned\n` +
      `  ${result.sessions_shipped} sessions with new turns\n` +
      `  ${result.turns_seen} fresh turns\n` +
      `  ${result.turns_skipped} already synced\n` +
      `\nstate: ${statePath}\n` +
      `\nobservation extraction runs server-side in the background.\n` +
      `reload /me in a couple minutes to see new observations land.\n`,
    );
    return 0;
  } catch (e) {
    try { saveState(statePath, state); } catch { /* ignore */ }
    process.stderr.write(`sync failed: ${(e as Error).message}\n`);
    return 1;
  }
}

interface StatusFlags { projectsDir?: string }

async function runStatus(flags: StatusFlags): Promise<number> {
  const statePath = defaultPath();
  const state = loadState(statePath);
  const projectsDir = flags.projectsDir
    || path.join(process.env.HOME || ".", ".claude", "projects");
  const files = listSessionFiles(projectsDir);
  process.stdout.write(JSON.stringify({
    state_path: statePath,
    projects_dir: projectsDir,
    files_on_disk: files.length,
    sessions_in_state: Object.keys(state.sessions).length,
    last_sync_at: state.last_sync_at,
  }, null, 2) + "\n");
  return 0;
}
