// cli.ts — `cosmos-mcp shell-history <sync|status>` entrypoint.

import { defaultPath, loadState, saveState } from "./state.js";
import { syncShellHistory } from "./sync.js";

function parseStringFlag(rest: string[], name: string): string | undefined {
  const eq = rest.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = rest.indexOf(name);
  if (idx >= 0 && rest[idx + 1]) return rest[idx + 1];
  return undefined;
}

export async function runShellHistoryCli(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const verbose = rest.includes("--verbose") || rest.includes("-v");
  const dryRun = rest.includes("--dry-run");
  const historyPath = parseStringFlag(rest, "--history");
  const backfill = rest.includes("--backfill");
  switch (sub) {
    case "sync": return runSync({ verbose, dryRun, historyPath, backfill });
    case "status": return runStatus();
    default:
      process.stderr.write(
        `Usage: cosmos-mcp shell-history <sync|status> [flags]\n` +
        `  --verbose         log per-command detail\n` +
        `  --dry-run         scan and report; do not ship\n` +
        `  --history PATH    override history file (default: ~/.zsh_history)\n` +
        `  --backfill        ignore the watermark and resync from byte 0\n`,
      );
      return 1;
  }
}

interface SyncFlags { verbose: boolean; dryRun: boolean; historyPath?: string; backfill: boolean }

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
  if (flags.backfill) state.last_byte = 0;

  process.stdout.write(`cosmos · shell history sync${flags.dryRun ? " (dry-run)" : ""}\n`);
  try {
    const r = await syncShellHistory({
      state, apiBase, token,
      historyPath: flags.historyPath,
      verbose: flags.verbose,
      dryRun: flags.dryRun,
    });
    if (!flags.dryRun) saveState(statePath, state);
    process.stdout.write(
      `\n  ${r.history_path || "(no history file)"}\n` +
      `  ${r.bytes_scanned} bytes scanned\n` +
      `  ${r.commands_read} commands read\n` +
      `  ${r.commands_shipped} commands shipped (after dedup + filter)\n` +
      `  status: ${r.status}\n` +
      (r.node_id ? `  node_id: ${r.node_id}\n` : "") +
      `\nstate: ${statePath}\n`,
    );
    return 0;
  } catch (e) {
    try { saveState(statePath, state); } catch { /* ignore */ }
    process.stderr.write(`sync failed: ${(e as Error).message}\n`);
    return 1;
  }
}

async function runStatus(): Promise<number> {
  const statePath = defaultPath();
  const state = loadState(statePath);
  process.stdout.write(JSON.stringify({
    state_path: statePath,
    last_byte: state.last_byte,
    last_path: state.last_path,
    last_sync_at: state.last_sync_at,
  }, null, 2) + "\n");
  return 0;
}
