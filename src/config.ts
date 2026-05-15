import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export interface Config {
  cosmosUrl: string;
  mcpKey: string;
  polarityUserId: string;
}

const DEFAULT_COSMOS_URL = "https://cosmos.polarity-lab.com";
const TOKEN_DIR = join(homedir(), ".config", "cosmos-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "token");

export function loadConfig(): Config {
  const cosmosUrl = process.env.COSMOS_URL || DEFAULT_COSMOS_URL;

  let mcpKey = process.env.COSMOS_MCP_KEY || "";
  let polarityUserId = process.env.COSMOS_USER_ID || "";

  if ((!mcpKey || !polarityUserId) && existsSync(TOKEN_FILE)) {
    try {
      const raw = readFileSync(TOKEN_FILE, "utf8").trim();
      const parsed = JSON.parse(raw) as { key?: string; user_id?: string };
      mcpKey = mcpKey || parsed.key || "";
      polarityUserId = polarityUserId || parsed.user_id || "";
    } catch {
      // fall through; will error below if still missing
    }
  }

  if (!mcpKey) {
    throw new Error(
      "No Cosmos MCP key found. Run `npx @polarity-lab/cosmos-mcp init` or set COSMOS_MCP_KEY env var.",
    );
  }
  if (!polarityUserId) {
    throw new Error(
      "No polarity user id found. Run `npx @polarity-lab/cosmos-mcp init` or set COSMOS_USER_ID env var.",
    );
  }

  return { cosmosUrl, mcpKey, polarityUserId };
}

export const TOKEN_PATHS = { dir: TOKEN_DIR, file: TOKEN_FILE };
