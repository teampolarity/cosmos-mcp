#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "./util/zod-to-json.js";
import { TOOLS, findTool } from "./tools/index.js";
import { CosmosClient, CosmosError } from "./client/cosmos.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "init") {
    const { runBootstrap } = await import("./auth/bootstrap.js");
    await runBootstrap();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write("cosmos-mcp 0.1.0\n");
    return;
  }
  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const config = loadConfig();
  const client = new CosmosClient(config);

  const server = new Server(
    { name: "cosmos-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = findTool(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      };
    }
    const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments for ${tool.name}: ${parsed.error.message}`,
          },
        ],
      };
    }
    try {
      const result = await tool.handler(parsed.data, client);
      return {
        content: [
          { type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) },
        ],
      };
    } catch (e) {
      const message =
        e instanceof CosmosError
          ? `${e.status} from cosmos at ${e.path}: ${typeof e.body === "string" ? e.body : JSON.stringify(e.body)}`
          : e instanceof Error
            ? e.message
            : String(e);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function printHelp(): void {
  process.stdout.write(
    `cosmos-mcp — MCP server for the Polarity exocortex

Usage:
  cosmos-mcp           Run the MCP server over stdio (default)
  cosmos-mcp init      One-time browser-based auth bootstrap
  cosmos-mcp --version
  cosmos-mcp --help

Environment:
  COSMOS_URL           Cosmos base URL (default: https://cosmos.polarity-lab.com)
  COSMOS_MCP_KEY       Per-user MCP key (pmk_...). Overrides the cached token file.
  COSMOS_USER_ID       Polarity user id. Overrides the cached token file.
  COSMOS_SYSTEM_KEY    Shared system key for single-tenant mode (sends X-System-Key
                       instead of X-MCP-Key). Requires COSMOS_USER_ID. Use this when
                       running your own cosmos or before per-user keys are deployed.

Token cache:
  ~/.config/cosmos-mcp/token  (created by 'cosmos-mcp init', 0600 perms)
`,
  );
}

main().catch((e) => {
  process.stderr.write(`cosmos-mcp fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
