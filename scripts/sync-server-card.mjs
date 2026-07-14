import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOLS } from '../dist/tools/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../worker/src/index.ts');
const packageVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;

const tools = TOOLS.map((t) => {
  const schema = zodToJsonSchema(t.inputSchema, { target: 'openApi3', $refStrategy: 'none' });
  delete schema.$schema;
  return { name: t.name, description: t.description, inputSchema: schema };
});

const cardObj = {
  serverInfo: { name: 'cosmos-mcp', version: packageVersion },
  tools,
  resources: [],
  prompts: [],
};

// Emit a JavaScript string literal, not a template literal. Tool
// descriptions may contain backticks, `${...}`, and quoted examples.
const cardLiteral = JSON.stringify(JSON.stringify(cardObj));
const workerSrc = fs.readFileSync(workerPath, 'utf8');
const withVersion = workerSrc.replace(
  /const PACKAGE_VERSION = "[^"]+";/,
  `const PACKAGE_VERSION = "${packageVersion}";`,
);
const next = withVersion.replace(
  /const SERVER_CARD = (?:`[\s\S]*?`|"(?:[^"\\]|\\.)*");/,
  `const SERVER_CARD = ${cardLiteral};`,
);
fs.writeFileSync(workerPath, next);
console.log(`updated ${workerPath} (${tools.length} tools)`);
