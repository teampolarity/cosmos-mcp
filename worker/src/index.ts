const NPM_URL = "https://www.npmjs.com/package/@polarity-lab/cosmos-mcp";
const REPO_URL = "https://github.com/sh6drack/cosmos-mcp";

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polarity MCP</title>
<meta name="description" content="The bridge between your Polarity exocortex and any LLM client.">
<style>
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fafaf7;
    color: #111;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
  }
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 72px 24px 96px;
  }
  h1 {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.01em;
    margin: 0 0 8px;
  }
  .tagline {
    font-size: 18px;
    color: #444;
    margin: 0 0 32px;
  }
  p {
    margin: 0 0 16px;
  }
  h2 {
    font-size: 16px;
    font-weight: 500;
    margin: 32px 0 12px;
    color: #111;
  }
  hr {
    border: none;
    border-top: 1px solid #e5e3dc;
    margin: 32px 0;
  }
  pre {
    background: #f1efe8;
    padding: 12px 16px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 14px;
    margin: 0 0 16px;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  a {
    color: #111;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  a:hover {
    color: #555;
  }
  .links a {
    margin-right: 20px;
  }
  footer {
    margin-top: 48px;
    font-size: 14px;
    color: #666;
  }
</style>
</head>
<body>
<main>
  <h1>Polarity MCP</h1>
  <p class="tagline">One graph. Any agent.</p>

  <p>Polarity MCP is the bridge between your Polarity exocortex and any LLM client you use. Sign in once. Connect Claude, Cursor, Codex, Zed. They all read and write to the same knowledge graph. The graph stays yours.</p>

  <hr>

  <h2>Install</h2>
  <pre><code>npx @polarity-lab/cosmos-mcp init</code></pre>
  <p>Then point your MCP client at it. Setup details on GitHub.</p>
  <p class="links">
    <a href="${NPM_URL}">Get the package on npm</a>
    <a href="${REPO_URL}">Open the repo on GitHub</a>
  </p>

  <hr>

  <h2>Self-hosting</h2>
  <p>The cosmos backend is open source. Run your own and set <code>COSMOS_URL</code>.</p>

  <footer>Made by Polarity Lab.</footer>
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
