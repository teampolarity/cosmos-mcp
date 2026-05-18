const NPM_URL = "https://www.npmjs.com/package/@polarity-lab/cosmos-mcp";
const REPO_URL = "https://github.com/sh6drack/cosmos-mcp";

// Static MCP server card. Generated from src/tools/index.ts via scripts/gen-server-card.mjs.
// Smithery reads this from /.well-known/mcp/server-card.json to skip its scan step
// when the package is stdio-only and cannot be reached as an HTTP MCP endpoint.
const SERVER_CARD = `{"serverInfo":{"name":"cosmos-mcp","version":"0.4.1"},"tools":[{"name":"polarity_whoami","description":"Returns the polarity user id and cosmos account info that this MCP key is bound to. Cheap connectivity test. Call this first if the user asks who you know them as.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"polarity_export","description":"Export the user's full personal knowledge graph (nodes + edges + counts) as JSON in polarity/v1 format. Use this when the user asks for a snapshot of their exocortex, wants their data, or asks to download their .polarity file. Returns the full graph; can be large.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"polarity_get_graph","description":"Read the user's graph view. \`entity\` selects which projection: 'user' (the user's self-graph), 'cosmos' (the cosmos entity's view of them), or 'polarity' (the dyadic synchronization between the two). Use 'user' for general questions about what the user thinks, does, or knows. Use 'polarity' when comparing the user's self-image against the system's observation.","inputSchema":{"type":"object","properties":{"entity":{"type":"string","enum":["user","cosmos","polarity"]}},"additionalProperties":false}},{"name":"polarity_ask","description":"Ask a natural-language question over the user's personal knowledge graph. Cosmos synthesizes an answer from relevant nodes and edges. Use this when the user wants context-aware reasoning rather than raw data. Returns answer text plus cited node/edge ids.","inputSchema":{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":2000}},"required":["query"],"additionalProperties":false}},{"name":"polarity_observe","description":"Write a freeform observation about the user into their personal graph. Cosmos runs its extractor on the text. Use this when you notice something durable about the user during a session that they would want their other AI agents to know later. Examples: stated preferences, recurring frustrations, project context, relationships. Do not log ephemeral chat content. \`source\` should identify your client (e.g. 'claude-code', 'cursor'). \`kind\` defaults to 'observation'; use 'event' for things that happened, 'preference' for stated likes/dislikes.","inputSchema":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"source":{"type":"string","maxLength":64},"tags":{"type":"array","items":{"type":"string","maxLength":32},"maxItems":8},"kind":{"type":"string","enum":["observation","event","preference"]},"confidence":{"type":"number","minimum":0,"maximum":1}},"required":["text"],"additionalProperties":false}},{"name":"polarity_record_event","description":"Record a structured event in the user's graph. Convenience wrapper over polarity_observe with kind='event'. Use for things that happened at a point in time: a meeting, a shipped release, a flight, an incident.","inputSchema":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"source":{"type":"string","maxLength":64},"tags":{"type":"array","items":{"type":"string","maxLength":32},"maxItems":8},"confidence":{"type":"number","minimum":0,"maximum":1}},"required":["text"],"additionalProperties":false}},{"name":"polarity_record_preference","description":"Record a stated preference in the user's graph. Convenience wrapper over polarity_observe with kind='preference'. Use when the user expresses a like, dislike, opinion, or working-style rule that should persist across sessions.","inputSchema":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"source":{"type":"string","maxLength":64},"tags":{"type":"array","items":{"type":"string","maxLength":32},"maxItems":8},"confidence":{"type":"number","minimum":0,"maximum":1}},"required":["text"],"additionalProperties":false}},{"name":"polarity_capture_turn","description":"Hand a whole user/assistant exchange to cosmos so it can extract every durable observation worth holding (preferences, constraints, project context, relationships, decisions, emotional signals, working-style rules). PREFER this over multiple polarity_observe calls when a turn contained more than one fact about the user. Pass the user's message in \`user_text\`, your reply in \`assistant_text\`. Cosmos returns the node ids it created.","inputSchema":{"type":"object","properties":{"user_text":{"type":"string","minLength":1,"maxLength":16000},"assistant_text":{"type":"string","maxLength":16000},"source":{"type":"string","maxLength":64},"max_observations":{"type":"integer","minimum":1,"maximum":20}},"required":["user_text"],"additionalProperties":false}},{"name":"polarity_dump","description":"Write a short message tied to a location waypoint into the user's graph. PolarityGPS-style. Use only when the user is explicitly recording a place-anchored thought.","inputSchema":{"type":"object","properties":{"waypoint_id":{"type":"string","minLength":1,"maxLength":128},"name":{"type":"string","minLength":1,"maxLength":128},"lat":{"type":"number"},"lon":{"type":"number"},"message":{"type":"string","minLength":1,"maxLength":500}},"required":["waypoint_id","name","message"],"additionalProperties":false}},{"name":"polarity_checkin","description":"Record that the user checked in at a waypoint. Triggers co-presence detection against other users' recent check-ins.","inputSchema":{"type":"object","properties":{"waypoint_id":{"type":"string","minLength":1,"maxLength":128},"name":{"type":"string","minLength":1,"maxLength":128},"lat":{"type":"number"},"lon":{"type":"number"},"occurred_at":{"type":"string","format":"date-time"}},"required":["waypoint_id","name"],"additionalProperties":false}},{"name":"polarity_declare","description":"Declare future presence at a waypoint. \`chip\` is the time-window enum: next_30, next_hour, tonight, tomorrow_night.","inputSchema":{"type":"object","properties":{"waypoint_id":{"type":"string","minLength":1,"maxLength":128},"name":{"type":"string","minLength":1,"maxLength":128},"lat":{"type":"number"},"lon":{"type":"number"},"starts_at":{"type":"string","format":"date-time"},"ends_at":{"type":"string","format":"date-time"},"chip":{"type":"string","enum":["next_30","next_hour","tonight","tomorrow_night"]}},"required":["waypoint_id","name","starts_at","ends_at","chip"],"additionalProperties":false}}],"resources":[],"prompts":[]}
`;

// Matches cosmos.polarity-lab.com's favicon — mint signal dot on black.
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
<meta name="description" content="One graph. Any agent. MCP server for your Cosmos exocortex.">
<meta property="og:title" content="Cosmos MCP">
<meta property="og:description" content="One graph. Any agent.">
<meta property="og:url" content="https://mcp.polarity-lab.com">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#000; --ink-1:rgba(255,255,255,0.96); --ink-2:rgba(255,255,255,0.74);
    --ink-3:rgba(255,255,255,0.46); --ink-4:rgba(255,255,255,0.22);
    --ink-line:rgba(255,255,255,0.08); --signal:#7fedc7;
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
  main { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 96px 32px 96px; }
  .glitch {
    position: relative; display: inline-block;
    font-family: var(--font-display); font-weight: 500;
    font-size: clamp(40px, 8vw, 64px); letter-spacing: -0.02em;
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
  .meta {
    font-family: var(--font-mono); font-size: 11px;
    letter-spacing: 0.20em; text-transform: uppercase;
    color: var(--ink-3); margin: 0 0 56px;
    display: inline-flex; align-items: center; gap: 12px;
  }
  .meta::before { content: ""; display: inline-block; width: 32px; height: 1px; background: var(--ink-line); }
  p { font-size: 15px; line-height: 26px; color: var(--ink-2); margin: 0 0 18px; font-weight: 300; }
  p.lead { font-size: 17px; line-height: 28px; color: var(--ink-1); font-weight: 300; margin-bottom: 32px; }
  .section-label {
    font-family: var(--font-mono); font-size: 10px;
    letter-spacing: 0.20em; text-transform: uppercase;
    color: var(--ink-3); margin: 56px 0 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .section-label::after { content: ""; flex: 1; height: 1px; background: var(--ink-line); }
  pre {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--ink-line);
    padding: 16px 20px;
    overflow-x: auto;
    font-family: var(--font-mono); font-size: 13px;
    color: var(--signal);
    margin: 0 0 18px;
  }
  code { font-family: var(--font-mono); font-size: 13px; color: var(--signal); }
  p code { background: rgba(255,255,255,0.04); padding: 1px 6px; border: 1px solid var(--ink-line); }
  .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  .links a {
    flex: 1; min-width: 200px; display: inline-block; text-align: center;
    background: transparent; color: var(--ink-2);
    border: 1px solid var(--ink-line);
    padding: 14px 20px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.20em; text-transform: uppercase;
    text-decoration: none;
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
</style>
</head>
<body>
<div class="bg-shell"></div>
<div class="scanlines"></div>
<main>
  <div class="glitch" data-text="cosmos mcp">cosmos mcp</div>
  <div class="meta">one graph · any agent</div>

  <p class="lead">Cosmos MCP is the bridge between your Cosmos graph and any LLM client you use. Sign in once. Connect Claude, Cursor, Codex, Zed. They all read and write to the same graph. It stays yours.</p>

  <div class="section-label">Install</div>
  <pre><code>npx @polarity-lab/cosmos-mcp init</code></pre>
  <p>Opens your browser, mints a per-user key tied to your Cosmos account, caches it locally. Then point any MCP client at <code>npx @polarity-lab/cosmos-mcp</code>.</p>
  <div class="links">
    <a class="primary" href="${REPO_URL}">Open repo</a>
    <a href="${NPM_URL}">View on npm</a>
  </div>

  <div class="section-label">Self-hosting</div>
  <p>The Cosmos backend is open. Run your own and set <code>COSMOS_URL</code> to your domain. The <code>.polarity</code> file you export still travels with you.</p>

  <footer>Polarity Lab</footer>
</main>
</body>
</html>
`;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const isGetLike = request.method === "GET" || request.method === "HEAD";

    if (isGetLike && url.pathname === "/") {
      return new Response(request.method === "HEAD" ? null : HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
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

    if (isGetLike && url.pathname === "/install") {
      return Response.redirect(NPM_URL, 302);
    }

    if (isGetLike && url.pathname === "/repo") {
      return Response.redirect(REPO_URL, 302);
    }

    if (isGetLike && url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(request.method === "HEAD" ? null : SERVER_CARD, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
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
