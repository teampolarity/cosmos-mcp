import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOLS } from '../dist/tools/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../worker/src/index.ts');

const tools = TOOLS.map((t) => {
  const schema = zodToJsonSchema(t.inputSchema, { target: 'openApi3', $refStrategy: 'none' });
  delete schema.$schema;
  return { name: t.name, description: t.description, inputSchema: schema };
});

const cardObj = {
  serverInfo: { name: 'cosmos-mcp', version: '${PACKAGE_VERSION}' },
  tools,
  resources: [],
  prompts: [],
};

const cardJson = JSON.stringify(cardObj);
const workerSrc = fs.readFileSync(workerPath, 'utf8');
const next = workerSrc.replace(
  /const SERVER_CARD = `[\s\S]*?`;/,
  `const SERVER_CARD = \`${cardJson}\`;`,
);
fs.writeFileSync(workerPath, next);
console.log(`updated ${workerPath} (${tools.length} tools)`);
