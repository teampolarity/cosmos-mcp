const NPM_URL = "https://www.npmjs.com/package/@polarity-lab/cosmos-mcp";
const REPO_URL = "https://github.com/sh6drack/cosmos-mcp";

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

    return new Response("not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
