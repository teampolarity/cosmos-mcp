import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export type AuthMode = "mcp_key" | "system_key";

export interface Config {
  cosmosUrl: string;
  authMode: AuthMode;
  // When authMode === "mcp_key": the per-user pmk_ key.
  // When authMode === "system_key": the shared POLARITYGPS_SYSTEM_KEY.
  authToken: string;
  polarityUserId: string;
}

const DEFAULT_COSMOS_URL = "https://cosmos.polarity-lab.com";
const TOKEN_DIR = join(homedir(), ".config", "cosmos-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "token");

export function loadConfig(): Config | null {
  const cosmosUrl = process.env.COSMOS_URL || DEFAULT_COSMOS_URL;

  // Single-tenant / dev mode: shared system key + explicit user id.
  // For people running their own cosmos or for tonight's testing against
  // the live cosmos before the per-user MCP key path lands upstream.
  const systemKey = process.env.COSMOS_SYSTEM_KEY || "";
  if (systemKey) {
    const polarityUserId = process.env.COSMOS_USER_ID || "";
    if (!polarityUserId) {
      throw new Error(
        "COSMOS_SYSTEM_KEY is set but COSMOS_USER_ID is missing. " +
          "Set COSMOS_USER_ID to the polarity_user_id the key should act on behalf of.",
      );
    }
    return {
      cosmosUrl,
      authMode: "system_key",
      authToken: systemKey,
      polarityUserId,
    };
  }

  // Multi-tenant: per-user MCP key minted via the browser bootstrap flow.
  let mcpKey = process.env.COSMOS_MCP_KEY || "";
  let polarityUserId = process.env.COSMOS_USER_ID || "";

  if ((!mcpKey || !polarityUserId) && existsSync(TOKEN_FILE)) {
    try {
      const raw = readFileSync(TOKEN_FILE, "utf8").trim();
      const parsed = JSON.parse(raw) as { key?: string; user_id?: string };
      mcpKey = mcpKey || parsed.key || "";
      polarityUserId = polarityUserId || parsed.user_id || "";
    } catch {
      // fall through; the missing-credentials error below will fire
    }
  }

  if (!mcpKey || !polarityUserId) {
    return null;
  }

  return {
    cosmosUrl,
    authMode: "mcp_key",
    authToken: mcpKey,
    polarityUserId,
  };
}

export const UNCONFIGURED_MESSAGE =
  "cosmos-mcp is not authenticated. Run `npx @polarity-lab/cosmos-mcp init` " +
  "to mint a per-user key, or set COSMOS_MCP_KEY + COSMOS_USER_ID (or " +
  "COSMOS_SYSTEM_KEY + COSMOS_USER_ID for single-tenant mode).";

export const TOKEN_PATHS = { dir: TOKEN_DIR, file: TOKEN_FILE };
