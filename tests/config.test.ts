import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// loadConfig reads HOME-relative paths via os.homedir(). Redirecting HOME
// lets us point the legacy token file at a temp dir per-test. resetModules
// busts vitest's ESM module cache so the next dynamic import re-evaluates
// the module's top-level constants against the current HOME.
async function loadFreshConfig() {
  vi.resetModules();
  return (await import("../src/config.js")) as typeof import("../src/config.js");
}

describe("loadConfig", () => {
  let tmpHome: string;
  let prevHome: string | undefined;
  let prevEnv: Record<string, string | undefined>;

  beforeEach(() => {
    prevEnv = {
      COSMOS_URL: process.env.COSMOS_URL,
      COSMOS_MCP_KEY: process.env.COSMOS_MCP_KEY,
      COSMOS_USER_ID: process.env.COSMOS_USER_ID,
      COSMOS_SYSTEM_KEY: process.env.COSMOS_SYSTEM_KEY,
      HOME: process.env.HOME,
    };
    prevHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "cosmos-mcp-cfg-"));
    process.env.HOME = tmpHome;
    delete process.env.COSMOS_URL;
    delete process.env.COSMOS_MCP_KEY;
    delete process.env.COSMOS_USER_ID;
    delete process.env.COSMOS_SYSTEM_KEY;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (prevHome !== undefined) process.env.HOME = prevHome;
  });

  it("returns null when no env vars and no token file are present", async () => {
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()).toBeNull();
  });

  it("returns mcp_key mode when env vars are set", async () => {
    process.env.COSMOS_MCP_KEY = "pmk_env";
    process.env.COSMOS_USER_ID = "user-env";
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()).toEqual({
      cosmosUrl: "https://cosmos.polarity-lab.com",
      authMode: "mcp_key",
      authToken: "pmk_env",
      polarityUserId: "user-env",
    });
  });

  it("honors COSMOS_URL override", async () => {
    process.env.COSMOS_MCP_KEY = "pmk_env";
    process.env.COSMOS_USER_ID = "user-env";
    process.env.COSMOS_URL = "https://cosmos.staging.example.com";
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()?.cosmosUrl).toBe("https://cosmos.staging.example.com");
  });

  it("reads from the legacy token file when env vars are missing", async () => {
    const tokenDir = join(tmpHome, ".config", "cosmos-mcp");
    mkdirSync(tokenDir, { recursive: true });
    writeFileSync(
      join(tokenDir, "token"),
      JSON.stringify({ key: "pmk_file", user_id: "user-file" }),
    );
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()).toEqual({
      cosmosUrl: "https://cosmos.polarity-lab.com",
      authMode: "mcp_key",
      authToken: "pmk_file",
      polarityUserId: "user-file",
    });
  });

  it("env vars beat the legacy token file when both are present", async () => {
    const tokenDir = join(tmpHome, ".config", "cosmos-mcp");
    mkdirSync(tokenDir, { recursive: true });
    writeFileSync(
      join(tokenDir, "token"),
      JSON.stringify({ key: "pmk_file", user_id: "user-file" }),
    );
    process.env.COSMOS_MCP_KEY = "pmk_env";
    process.env.COSMOS_USER_ID = "user-env";
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()?.authToken).toBe("pmk_env");
    expect(loadConfig()?.polarityUserId).toBe("user-env");
  });

  it("system_key mode requires COSMOS_USER_ID and throws when missing", async () => {
    process.env.COSMOS_SYSTEM_KEY = "shared-system-key";
    const { loadConfig } = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/COSMOS_USER_ID is missing/);
  });

  it("system_key mode returns authMode=system_key when both vars are set", async () => {
    process.env.COSMOS_SYSTEM_KEY = "shared-system-key";
    process.env.COSMOS_USER_ID = "user-sys";
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()).toEqual({
      cosmosUrl: "https://cosmos.polarity-lab.com",
      authMode: "system_key",
      authToken: "shared-system-key",
      polarityUserId: "user-sys",
    });
  });

  it("system_key beats mcp_key when both are present (single-tenant override)", async () => {
    process.env.COSMOS_SYSTEM_KEY = "shared-system-key";
    process.env.COSMOS_USER_ID = "user-sys";
    process.env.COSMOS_MCP_KEY = "pmk_env";
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()?.authMode).toBe("system_key");
  });

  it("a malformed token file does not throw; returns null instead", async () => {
    const tokenDir = join(tmpHome, ".config", "cosmos-mcp");
    mkdirSync(tokenDir, { recursive: true });
    writeFileSync(join(tokenDir, "token"), "{not valid json");
    const { loadConfig } = await loadFreshConfig();
    expect(loadConfig()).toBeNull();
  });
});
