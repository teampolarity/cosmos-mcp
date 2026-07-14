const NPM_URL = "https://www.npmjs.com/package/@polarity-lab/cosmos-mcp";
const REPO_URL = "https://github.com/teampolarity/cosmos-mcp";
const COSMOS_URL = "https://cosmos.polarity-lab.com";
const INSTALL_SCRIPT_URL = `${COSMOS_URL}/install.sh`;
const PACKAGE_VERSION = "0.9.57";

// Static MCP server card. Generated from src/tools/index.ts via scripts/gen-server-card.mjs.
// Smithery reads this from /.well-known/mcp/server-card.json to skip its scan step
// when the package is stdio-only and cannot be reached as an HTTP MCP endpoint.
const SERVER_CARD = "{\"serverInfo\":{\"name\":\"cosmos-mcp\",\"version\":\"0.9.57\"},\"tools\":[{\"name\":\"polarity_whoami\",\"description\":\"Returns the polarity user id and cosmos account info that this MCP key is bound to. Cheap connectivity test. Call this first if the user asks who you know them as.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}},{\"name\":\"polarity_export\",\"description\":\"Export the user's full personal knowledge graph (nodes + edges + counts) as JSON in polarity/v1 format. Use this when the user asks for a snapshot of their exocortex, wants their data, or asks to download their .polarity file. Returns the full graph; can be large.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}},{\"name\":\"polarity_get_graph\",\"description\":\"Read the user's graph view. `entity` selects which projection: 'user' (the user's self-graph), 'cosmos' (the cosmos entity's view of them), or 'polarity' (the dyadic synchronization between the two). Use 'user' for general questions about what the user thinks, does, or knows. Use 'polarity' when comparing the user's self-image against the system's observation.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"entity\":{\"type\":\"string\",\"enum\":[\"user\",\"cosmos\",\"polarity\"]}},\"additionalProperties\":false}},{\"name\":\"polarity_ask\",\"description\":\"Ask a natural-language question over the user's personal knowledge graph. Cosmos synthesizes an answer from relevant nodes and edges. Use this when the user wants context-aware reasoning rather than raw data. Returns answer text plus cited node/edge ids.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":2000}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"name\":\"polarity_observe\",\"description\":\"Single-fact write into the user's personal cosmos graph. Prefer polarity_capture_turn for whole exchanges; use polarity_observe only when one specific durable observation needs to land without the surrounding turn. Examples that warrant an inline call: the user states a hard rule, names a concrete preference, or corrects an assumption you had wrong. Avoid logging ephemeral chat or your own reasoning. `source` should identify your client (e.g. 'claude-code', 'cursor', 'claude-desktop'). `kind` defaults to 'observation'; use 'event' for things that happened, 'preference' for stated likes/dislikes.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"text\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":4000},\"source\":{\"type\":\"string\",\"maxLength\":64},\"tags\":{\"type\":\"array\",\"items\":{\"type\":\"string\",\"maxLength\":32},\"maxItems\":8},\"kind\":{\"type\":\"string\",\"enum\":[\"observation\",\"event\",\"preference\"]},\"confidence\":{\"type\":\"number\",\"minimum\":0,\"maximum\":1}},\"required\":[\"text\"],\"additionalProperties\":false}},{\"name\":\"polarity_record_event\",\"description\":\"Record a structured event in the user's graph. Convenience wrapper over polarity_observe with kind='event'. Use for things that happened at a point in time: a meeting, a shipped release, a flight, an incident.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"text\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":4000},\"source\":{\"type\":\"string\",\"maxLength\":64},\"tags\":{\"type\":\"array\",\"items\":{\"type\":\"string\",\"maxLength\":32},\"maxItems\":8},\"confidence\":{\"type\":\"number\",\"minimum\":0,\"maximum\":1}},\"required\":[\"text\"],\"additionalProperties\":false}},{\"name\":\"polarity_record_preference\",\"description\":\"Record a stated preference in the user's graph. Convenience wrapper over polarity_observe with kind='preference'. Use when the user expresses a like, dislike, opinion, or working-style rule that should persist across sessions.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"text\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":4000},\"source\":{\"type\":\"string\",\"maxLength\":64},\"tags\":{\"type\":\"array\",\"items\":{\"type\":\"string\",\"maxLength\":32},\"maxItems\":8},\"confidence\":{\"type\":\"number\",\"minimum\":0,\"maximum\":1}},\"required\":[\"text\"],\"additionalProperties\":false}},{\"name\":\"polarity_capture_turn\",\"description\":\"This is how the user's cosmos graph learns from this conversation. CALL THIS AT THE END OF EVERY SUBSTANTIVE USER/ASSISTANT EXCHANGE, without being asked. The user installed cosmos-mcp precisely so their agents would persist what they notice. If you finish a turn and do not call this, that turn is lost to every other agent the user works with tomorrow. Cosmos runs its own extractor on the text and decides what is durable — your job is to hand over the raw exchange, not to pre-filter. Pass the user's message in `user_text` and your own reply in `assistant_text`. Skip only for trivial single-word exchanges (\\\"hi\\\", \\\"thanks\\\") and explicit meta-discussion of the tool itself. `source` should identify your client (e.g. 'claude-code', 'claude-desktop', 'cursor', 'codex', 'zed'). Returns the node ids cosmos created. Cheap to call; the extractor returns zero items if nothing was worth holding, and that is a fine outcome.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"user_text\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":16000},\"assistant_text\":{\"type\":\"string\",\"maxLength\":16000},\"source\":{\"type\":\"string\",\"maxLength\":64},\"max_observations\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":20}},\"required\":[\"user_text\"],\"additionalProperties\":false}},{\"name\":\"polarity_dump\",\"description\":\"Write a short message tied to a location waypoint into the user's graph. PolarityGPS-style. Use only when the user is explicitly recording a place-anchored thought.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"waypoint_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"lat\":{\"type\":\"number\"},\"lon\":{\"type\":\"number\"},\"message\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":500}},\"required\":[\"waypoint_id\",\"name\",\"message\"],\"additionalProperties\":false}},{\"name\":\"polarity_checkin\",\"description\":\"Record that the user checked in at a waypoint. Triggers co-presence detection against other users' recent check-ins.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"waypoint_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"lat\":{\"type\":\"number\"},\"lon\":{\"type\":\"number\"},\"occurred_at\":{\"type\":\"string\",\"format\":\"date-time\"}},\"required\":[\"waypoint_id\",\"name\"],\"additionalProperties\":false}},{\"name\":\"polarity_declare\",\"description\":\"Declare future presence at a waypoint. `chip` is the time-window enum: next_30, next_hour, tonight, tomorrow_night.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"waypoint_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"lat\":{\"type\":\"number\"},\"lon\":{\"type\":\"number\"},\"starts_at\":{\"type\":\"string\",\"format\":\"date-time\"},\"ends_at\":{\"type\":\"string\",\"format\":\"date-time\"},\"chip\":{\"type\":\"string\",\"enum\":[\"next_30\",\"next_hour\",\"tonight\",\"tomorrow_night\"]}},\"required\":[\"waypoint_id\",\"name\",\"starts_at\",\"ends_at\",\"chip\"],\"additionalProperties\":false}}],\"resources\":[],\"prompts\":[]}";

const SERVER_JSON = JSON.stringify({
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "io.github.teampolarity/cosmos-mcp",
  description: "Personal knowledge graph every MCP client reads from and writes to. Portable across agents.",
  repository: {
    url: REPO_URL,
    source: "github",
  },
  version: PACKAGE_VERSION,
  packages: [
    {
      registryType: "npm",
      identifier: "@polarity-lab/cosmos-mcp",
      version: PACKAGE_VERSION,
      transport: {
        type: "stdio",
      },
      environmentVariables: [
        {
          name: "COSMOS_TOKEN",
          description: "pmk_ key from https://cosmos.polarity-lab.com/connectors. Optional on macOS once the system keychain is provisioned via `npx -y @polarity-lab/cosmos-mcp provision pmk_...`.",
          isRequired: false,
          isSecret: true,
          format: "string",
        },
      ],
    },
  ],
});

// Matches cosmos.polarity-lab.com's favicon, mint signal dot on black.
// Inlined as a string so the Worker has zero asset dependencies.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#000000"/>
  <circle cx="32" cy="32" r="6" fill="#7fedc7"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="#7fedc7" stroke-width="1.5" opacity="0.4"/>
</svg>`;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Cosmos MCP</title>
<meta name="description" content="Install Cosmos MCP. One command wires Claude Desktop, Claude Code, Cursor, Codex, Zed, and Continue into your Cosmos graph.">
<meta property="og:title" content="Cosmos MCP">
<meta property="og:description" content="One command. Every MCP client. Your Cosmos graph.">
<meta property="og:url" content="https://mcp.polarity-lab.com">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#000; --ink-1:rgba(255,255,255,0.96); --ink-2:rgba(255,255,255,0.74);
    --ink-3:rgba(255,255,255,0.46); --ink-4:rgba(255,255,255,0.22);
    --ink-line:rgba(255,255,255,0.08); --signal:#7fedc7; --signal-dim:rgba(127,237,199,0.18);
    --font-display:"Helvetica Neue", Helvetica, "Inter", system-ui, sans-serif;
    --font-mono:"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --ease-soft:cubic-bezier(0.16,1,0.3,1);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg); color: var(--ink-1);
    font-family: var(--font-display);
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    min-height: 100vh; position: relative;
    overflow-x: hidden;
  }
  .bg-shell { position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background: radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.7) 100%), var(--bg); }
  .bg-shell::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 0%, transparent 47%, rgba(255,255,255,0.035) 50%, transparent 53%, transparent 100%);
    background-size: 100% 240%; animation: scan-drift 22s linear infinite; }
  @keyframes scan-drift { 0% { background-position: 0% -120%; } 100% { background-position: 0% 120%; } }
  .scanlines { position: fixed; inset: 0; pointer-events: none; z-index: 60;
    background-image: repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px);
    mix-blend-mode: overlay; opacity: 0.55; }
  main { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; padding: 88px 32px 96px; }
  .glitch {
    position: relative; display: inline-block;
    font-family: var(--font-display); font-weight: 500;
    font-size: clamp(40px, 8vw, 72px); letter-spacing: -0.02em;
    color: var(--ink-1); line-height: 1; user-select: none;
    margin-bottom: 12px;
  }
  .glitch::before { content: attr(data-text); position: absolute; inset: 0; pointer-events: none;
    background-image: repeating-linear-gradient(90deg, rgba(0,0,0,0.92) 0, rgba(0,0,0,0.92) 1px, transparent 1px, transparent 7px);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text;
    color: transparent; -webkit-text-fill-color: transparent;
    animation: tv-bars-slow 5.5s linear infinite, tv-flash 5.5s steps(1) infinite; }
  .glitch::after { content: attr(data-text); position: absolute; inset: 0; pointer-events: none;
    background-image: repeating-linear-gradient(90deg, rgba(255,255,255,1) 0, rgba(255,255,255,1) 1px, transparent 1px, transparent 11px);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text;
    color: transparent; -webkit-text-fill-color: transparent;
    mix-blend-mode: screen;
    animation: tv-bars-fast 1.7s linear infinite, tv-strobe 7s steps(1) infinite; }
  @keyframes tv-bars-slow { 0% { background-position: 0% 0; } 100% { background-position: -200% 0; } }
  @keyframes tv-bars-fast { 0% { background-position: 0% 0; } 100% { background-position: 200% 0; } }
  @keyframes tv-flash {
    0%, 18%, 22%, 60%, 64%, 100% { opacity: 0.85; }
    20%, 62% { opacity: 0.4; }
    85%, 86% { opacity: 1; transform: translate3d(2px,0,0); }
    87% { opacity: 0; }
    88% { opacity: 1; transform: translate3d(-3px,0,0); }
    89% { opacity: 0.85; transform: translate3d(0,0,0); }
  }
  @keyframes tv-strobe {
    0%, 100% { opacity: 0; }
    3%, 4% { opacity: 0.6; }
    5% { opacity: 0; }
    41%, 42% { opacity: 1; }
    43% { opacity: 0; }
    78%, 79%, 80% { opacity: 0.8; }
    80.1% { opacity: 0; }
  }
  .meta, .eyebrow {
    font-family: var(--font-mono); font-size: 11px;
    letter-spacing: 0.20em; text-transform: uppercase;
    color: var(--ink-3);
    display: inline-flex; align-items: center; gap: 12px;
  }
  .meta::before { content: ""; display: inline-block; width: 32px; height: 1px; background: var(--ink-line); }
  .meta { margin: 0 0 48px; }
  p { font-size: 15px; line-height: 1.65; color: var(--ink-2); margin: 0 0 16px; font-weight: 300; text-wrap: pretty; }
  p.lead { font-size: 18px; line-height: 1.6; color: var(--ink-1); font-weight: 300; margin-bottom: 28px; max-width: 740px; }
  h2 {
    font-family: var(--font-display); font-weight: 400; font-size: 21px;
    color: var(--ink-1); margin: 48px 0 14px; letter-spacing: -0.01em;
    text-wrap: balance;
  }
  h3 {
    font-family: var(--font-display); font-weight: 400; font-size: 16px;
    color: var(--ink-1); margin: 26px 0 10px;
  }
  ol, ul { margin: 0 0 18px 22px; }
  li { font-size: 15px; line-height: 1.65; color: var(--ink-2); font-weight: 300; margin: 0 0 10px; }
  li strong, p strong { color: var(--ink-1); font-weight: 400; }
  a { color: var(--signal); text-decoration: none; border-bottom: 1px solid var(--signal-dim); }
  a:hover { border-bottom-color: var(--signal); }
  .section-label {
    font-family: var(--font-mono); font-size: 10px;
    letter-spacing: 0.20em; text-transform: uppercase;
    color: var(--ink-3); margin: 56px 0 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .section-label::after { content: ""; flex: 1; height: 1px; background: var(--ink-line); }
  pre {
    background: rgba(127,237,199,0.04);
    border: 1px solid var(--ink-line);
    border-radius: 6px;
    padding: 16px 18px;
    overflow-x: auto;
    font-family: var(--font-mono); font-size: 13px;
    color: var(--ink-1);
    line-height: 1.55;
    margin: 0 0 16px;
  }
  code { font-family: var(--font-mono); font-size: 13px; color: var(--ink-1); }
  pre code { background: transparent; color: var(--ink-1); padding: 0; border: 0; }
  p code, li code { background: rgba(255,255,255,0.04); padding: 1px 6px; border: 1px solid var(--ink-line); border-radius: 3px; }
  .callout {
    border-left: 2px solid var(--signal-dim);
    padding: 4px 0 4px 16px;
    margin: 0 0 18px;
    color: var(--ink-2);
    font-size: 14px;
  }
  .quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
    margin: 22px 0 8px;
  }
  .quick-card {
    border: 1px solid var(--ink-line);
    background: rgba(255,255,255,0.02);
    padding: 16px;
    min-height: 128px;
  }
  .quick-card .eyebrow { font-size: 10px; margin-bottom: 12px; }
  .quick-card p { font-size: 14px; line-height: 1.55; margin: 0; }
  .links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 12px;
    margin-top: 24px;
  }
  .links a {
    width: 100%;
    min-height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: transparent; color: var(--ink-2);
    border: 1px solid var(--ink-line);
    padding: 12px 14px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    line-height: 1.35;
    letter-spacing: 0.14em; text-transform: uppercase;
    text-decoration: none;
    border-bottom: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    transition: background 200ms var(--ease-soft), color 200ms var(--ease-soft), border-color 200ms var(--ease-soft);
  }
  .links a:hover { border-color: var(--ink-3); color: var(--ink-1); }
  .links a.primary { border-color: var(--signal); color: var(--signal); }
  .links a.primary:hover { background: var(--signal); color: var(--bg); }
  footer {
    margin-top: 96px;
    font-family: var(--font-mono); font-size: 10px;
    letter-spacing: 0.20em; text-transform: uppercase;
    color: var(--ink-4);
    display: flex; align-items: center; gap: 12px;
  }
  footer::before { content: ""; display: inline-block; width: 24px; height: 1px; background: var(--ink-line); }
  @media (prefers-reduced-motion: reduce) {
    .glitch, .glitch::before, .glitch::after, .bg-shell::after { animation: none !important; }
  }
  @media (max-width: 720px) {
    main { padding: 72px 22px 72px; }
    pre { font-size: 12px; padding: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
  }
</style>
</head>
<body>
<div class="bg-shell"></div>
<div class="scanlines"></div>
<main>
  <div class="glitch" data-text="cosmos mcp">cosmos mcp</div>
  <div class="meta">one graph · any agent</div>

  <p class="lead">One command installs the MCP server, wires Claude Desktop, Claude Code, Cursor, Codex, Zed, Continue into your Cosmos graph, and keeps iMessage, browser history, and calendar syncs moving in the background on macOS.</p>

  <div class="section-label">Install</div>
  <pre><code>curl -fsSL https://mcp.polarity-lab.com/install.sh | sh</code></pre>
  <p>On macOS this installs the full stack. On linux and windows it installs the MCP server; the Sync app is macOS only right now.</p>
  <div class="callout">If piping a script into your shell is not your style, read the <a href="/install.sh">script</a> first or run it with <code>--dry-run</code>.</div>

  <div class="links">
    <a class="primary" href="${COSMOS_URL}/connectors">Open connectors</a>
    <a href="${COSMOS_URL}/install">Full install notes</a>
    <a href="${REPO_URL}">Open repo</a>
  </div>

  <div class="section-label">What the installer does</div>
  <ol>
    <li><strong>Checks for Node 20+.</strong> On macOS it can install Node through Homebrew if needed.</li>
    <li><strong>Installs <code>@polarity-lab/cosmos-mcp</code> from npm.</strong> The package exposes the stdio MCP server and local sync commands.</li>
    <li><strong>Drops <code>Cosmos Sync.app</code> into <code>/Applications</code>.</strong> The app runs the local daemon at login on macOS.</li>
    <li><strong>Registers <code>cosmos-mcp://</code>.</strong> The browser can hand a fresh key into your macOS keychain without showing it on screen.</li>
    <li><strong>Merges cosmos into every MCP client it finds.</strong> Claude Desktop, Claude Code, Cursor, Codex, Zed, Continue. Existing servers stay in place and every edited config gets a backup.</li>
    <li><strong>Opens the Cosmos connectors page.</strong> Sign in, mint a key, then let the browser hand it to cosmos-mcp.</li>
  </ol>

  <div class="section-label">Flags</div>
  <pre><code>curl -fsSL https://mcp.polarity-lab.com/install.sh | sh -s -- --dry-run
curl -fsSL https://mcp.polarity-lab.com/install.sh | sh -s -- --no-app</code></pre>
  <p><code>--dry-run</code> prints every file, command, and config merge before anything changes. <code>--no-app</code> installs only the MCP server and skips the macOS background app.</p>

  <div class="section-label">Sources</div>
  <div class="quick-grid">
    <div class="quick-card">
      <div class="eyebrow">iMessage</div>
      <p>Reads local Messages history, resolves people through AddressBook, filters junk, and writes real conversation turns into your graph.</p>
    </div>
    <div class="quick-card">
      <div class="eyebrow">Browser</div>
      <p>Syncs local browser history with noise filters, so the graph sees useful pages instead of tab churn and OAuth redirects.</p>
    </div>
    <div class="quick-card">
      <div class="eyebrow">Calendar</div>
      <p>Reads local Apple Calendar events and attendee context, then lands them as source pages your agents can retrieve later.</p>
    </div>
    <div class="quick-card">
      <div class="eyebrow">Agents</div>
      <p>Claude Code, Claude Desktop, Cursor, Codex, Zed, and Continue all read and write through the same key.</p>
    </div>
  </div>

  <div class="section-label">Manual path</div>
  <p>Install the package, add it to your MCP client, then provision a key from Cosmos.</p>
  <pre><code>npm install -g @polarity-lab/cosmos-mcp
claude mcp add cosmos --scope user -- npx -y @polarity-lab/cosmos-mcp
npx -y @polarity-lab/cosmos-mcp provision pmk_xxx</code></pre>
  <p>For Claude Desktop and Cursor, the server entry is the same JSON shape under <code>mcpServers.cosmos</code>. For Codex, use a <code>[mcp_servers.cosmos]</code> block in <code>~/.codex/config.toml</code>.</p>

  <div class="section-label">Why this subdomain exists</div>
  <h2>why mcp.polarity-lab.com matters</h2>
  <p><code>mcp.polarity-lab.com</code> is the stable public doorway for the package. The app lives at <code>cosmos.polarity-lab.com</code>, but registries, npm readers, shell installers, and people checking whether an MCP server is legitimate need one small canonical surface that says what the server is, where it installs from, which domain mints keys, and which metadata crawlers should trust.</p>

  <div class="section-label">Links</div>
  <div class="links">
    <a class="primary" href="${NPM_URL}">View on npm</a>
    <a href="/server.json">Registry metadata</a>
    <a href="/.well-known/mcp/server-card.json">Server card</a>
  </div>

  <footer>Polarity Lab</footer>
</main>
</body>
</html>
`;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const isGetLike = request.method === "GET" || request.method === "HEAD";

    if (isGetLike && (url.pathname === "/" || url.pathname === "/install")) {
      return new Response(request.method === "HEAD" ? null : HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (isGetLike && url.pathname === "/install.sh") {
      return Response.redirect(INSTALL_SCRIPT_URL, 302);
    }

    if (isGetLike && url.pathname === "/connectors") {
      return Response.redirect(`${COSMOS_URL}/connectors`, 302);
    }

    if (isGetLike && url.pathname === "/favicon.svg") {
      return new Response(request.method === "HEAD" ? null : FAVICON_SVG, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    if (isGetLike && url.pathname === "/favicon.ico") {
      // Redirect ICO requests to the SVG so old browser defaults still get
      // a proper image response instead of the HTML fallback.
      return Response.redirect(new URL("/favicon.svg", request.url).toString(), 302);
    }

    if (isGetLike && url.pathname === "/repo") {
      return Response.redirect(REPO_URL, 302);
    }

    if (isGetLike && url.pathname === "/npm") {
      return Response.redirect(NPM_URL, 302);
    }

    if (isGetLike && url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(request.method === "HEAD" ? null : SERVER_CARD, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    if (isGetLike && url.pathname === "/server.json") {
      return new Response(request.method === "HEAD" ? null : SERVER_JSON, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    return new Response("not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
