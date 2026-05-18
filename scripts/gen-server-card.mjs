import { TOOLS } from "../dist/tools/index.js";
import { zodToJsonSchema } from "zod-to-json-schema";

const tools = TOOLS.map((t) => {
  const schema = zodToJsonSchema(t.inputSchema, { target: "openApi3", $refStrategy: "none" });
  delete schema.$schema;
  return {
    name: t.name,
    description: t.description,
    inputSchema: schema,
  };
});

const card = {
  serverInfo: {
    name: "cosmos-mcp",
    version: "0.4.1",
  },
  tools,
  resources: [],
  prompts: [],
};

process.stdout.write(JSON.stringify(card, null, 2));
