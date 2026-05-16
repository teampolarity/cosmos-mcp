import { createServer } from "node:http";
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { TOKEN_PATHS } from "../config.js";

const DEFAULT_COSMOS_URL = process.env.COSMOS_URL || "https://cosmos.polarity-lab.com";

export async function runBootstrap(): Promise<void> {
  const state = randomBytes(16).toString("hex");

  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      if (typeof addr === "object" && addr) {
        const p = addr.port;
        probe.close(() => resolve(p));
      } else {
        reject(new Error("could not bind loopback port"));
      }
    });
  });

  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const authUrl = new URL("/api/auth/mcp/grant", DEFAULT_COSMOS_URL);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  // Display name for the connector on the grant page. Override with
  // COSMOS_MCP_CLIENT_NAME (e.g. "Claude Code", "Cursor") if you're embedding
  // this in a specific client and want it labeled in the user's connector list.
  const clientName = process.env.COSMOS_MCP_CLIENT_NAME || "Cosmos MCP";
  authUrl.searchParams.set("client_name", clientName);

  process.stderr.write(
    `Open this URL in your browser to authorize cosmos-mcp:\n\n  ${authUrl.toString()}\n\n`,
  );
  openBrowser(authUrl.toString());

  // The grant page returns the raw key in the URL fragment, not the query
  // string. Fragments never leave the browser, so the loopback HTTP server
  // cannot read the key from the GET. The flow is two steps:
  //   1. GET /callback        — server validates state + captures user_id,
  //                             returns an HTML page that reads location.hash
  //                             and POSTs the key back.
  //   2. POST /callback-token — server reads the key from the body, fulfills
  //                             the promise, closes.
  const result = await new Promise<{ key: string; user_id: string }>((resolve, reject) => {
    let capturedUserId: string | null = null;

    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

      if (req.method === "GET" && url.pathname === "/callback") {
        const returnedState = url.searchParams.get("state");
        const userId = url.searchParams.get("user_id");
        const error = url.searchParams.get("error");
        const queryKey = url.searchParams.get("key");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" }).end(
            `<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`,
          );
          server.close();
          reject(new Error(`grant returned error: ${error}`));
          return;
        }
        if (returnedState !== state || !userId) {
          res.writeHead(400, { "Content-Type": "text/html" }).end(
            `<h1>Invalid callback</h1><p>State or user_id missing.</p>`,
          );
          server.close();
          reject(new Error("invalid callback"));
          return;
        }

        // Backward compat: older cosmos deployments put the key in the
        // query string. If we see it, accept it directly without the
        // two-step fragment dance. New deployments put it in the
        // fragment and rely on the in-page POST below.
        if (queryKey) {
          res.writeHead(200, { "Content-Type": "text/html" }).end(
            `<!doctype html><meta charset="utf-8"><title>cosmos-mcp connected</title>
             <style>body{font:14px/1.5 ui-sans-serif,system-ui;color:#222;max-width:480px;margin:80px auto;padding:0 16px}h1{font-size:18px;font-weight:600}</style>
             <h1>cosmos-mcp connected</h1>
             <p>You can close this tab and return to your terminal.</p>`,
          );
          server.close();
          resolve({ key: queryKey, user_id: userId });
          return;
        }

        capturedUserId = userId;
        res.writeHead(200, { "Content-Type": "text/html" }).end(callbackPage());
        return;
      }

      if (req.method === "POST" && url.pathname === "/callback-token") {
        if (!capturedUserId) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: "no pending callback" }),
          );
          return;
        }
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 8192) {
            res.writeHead(413).end();
            req.destroy();
          }
        });
        req.on("end", () => {
          let key: string | undefined;
          try {
            const parsed = JSON.parse(body) as { key?: unknown };
            if (typeof parsed.key === "string") key = parsed.key;
          } catch {}
          if (!key) {
            res.writeHead(400, { "Content-Type": "application/json" }).end(
              JSON.stringify({ error: "key missing" }),
            );
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({ ok: true }),
          );
          const userId = capturedUserId!;
          server.close();
          resolve({ key, user_id: userId });
        });
        return;
      }

      res.writeHead(404).end();
    });
    server.listen(port, "127.0.0.1");
  });

  mkdirSync(TOKEN_PATHS.dir, { recursive: true, mode: 0o700 });
  writeFileSync(TOKEN_PATHS.file, JSON.stringify(result, null, 2));
  chmodSync(TOKEN_PATHS.file, 0o600);

  process.stderr.write(`\nSaved token to ${TOKEN_PATHS.file}\n`);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? (["open", [url]] as const)
      : process.platform === "win32"
        ? (["cmd", ["/c", "start", "", url]] as const)
        : (["xdg-open", [url]] as const);
  execFile(cmd, [...args], (err) => {
    if (err) {
      process.stderr.write(`(could not auto-open browser: ${err.message})\n`);
    }
  });
}

function callbackPage(): string {
  // Tiny page served at GET /callback. Reads the raw key from
  // location.hash (the only place it exists — fragments don't reach the
  // server), POSTs it back to /callback-token, then shows a success
  // message. On any failure, surfaces the error in-page so the user can
  // see what went wrong instead of staring at a hung tab.
  return `<!doctype html><html><head>
<meta charset="utf-8"><title>cosmos-mcp connected</title>
<style>body{font:14px/1.5 ui-sans-serif,system-ui;color:#222;max-width:480px;margin:80px auto;padding:0 16px}h1{font-size:18px;font-weight:600}.err{color:#b00}</style>
</head><body>
<h1 id="h">finishing connection…</h1>
<p id="p">one moment.</p>
<script>
(function(){
  var h = document.getElementById('h');
  var p = document.getElementById('p');
  var hash = (location.hash || '').replace(/^#/, '');
  var params = new URLSearchParams(hash);
  var key = params.get('key');
  if (!key) {
    h.textContent = 'authorization incomplete';
    h.className = 'err';
    p.textContent = 'no key in callback. close this tab and try again.';
    return;
  }
  fetch('/callback-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: key })
  }).then(function(r){
    if (!r.ok) throw new Error('hand-off failed (' + r.status + ')');
    history.replaceState(null, '', '/callback');
    h.textContent = 'cosmos-mcp connected';
    p.textContent = 'you can close this tab and return to your terminal.';
  }).catch(function(e){
    h.textContent = 'authorization failed';
    h.className = 'err';
    p.textContent = String(e && e.message || e);
  });
})();
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
    );
  });
}
