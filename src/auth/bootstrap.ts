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
  const clientName = process.env.COSMOS_MCP_CLIENT_NAME || "Polarity MCP";
  authUrl.searchParams.set("client_name", clientName);

  process.stderr.write(
    `Open this URL in your browser to authorize cosmos-mcp:\n\n  ${authUrl.toString()}\n\n`,
  );
  openBrowser(authUrl.toString());

  const result = await new Promise<{ key: string; user_id: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const returnedState = url.searchParams.get("state");
      const key = url.searchParams.get("key");
      const userId = url.searchParams.get("user_id");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(
          `<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`,
        );
        server.close();
        reject(new Error(`grant returned error: ${error}`));
        return;
      }
      if (returnedState !== state || !key || !userId) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(
          `<h1>Invalid callback</h1><p>State or key missing.</p>`,
        );
        server.close();
        reject(new Error("invalid callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" }).end(
        `<!doctype html><meta charset="utf-8"><title>cosmos-mcp connected</title>
         <style>body{font:14px/1.5 ui-sans-serif,system-ui;color:#222;max-width:480px;margin:80px auto;padding:0 16px}h1{font-size:18px;font-weight:600}</style>
         <h1>cosmos-mcp connected</h1>
         <p>You can close this tab and return to your terminal.</p>`,
      );
      server.close();
      resolve({ key, user_id: userId });
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
    );
  });
}
