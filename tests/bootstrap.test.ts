// Tests the loopback callback in src/auth/bootstrap.ts. Spawns the real
// CLI (`node dist/server.js init`) as a subprocess so the loopback HTTP
// server runs in a fresh process, then drives it via http. Asserts both
// the new fragment-key path (POST /callback-token) and the backward-
// compatible key-in-query path that lets 0.1.1 work against the older
// cosmos deploy.

import { describe, it, expect, beforeAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

async function waitForPort(port: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`port ${port} never came up`);
}

interface Bootstrap {
  child: ChildProcess;
  port: number;
  state: string;
  home: string;
  exited: Promise<number>;
}

async function startBootstrap(): Promise<Bootstrap> {
  const home = mkdtempSync(join(tmpdir(), "cosmos-mcp-test-"));
  const child = spawn("node", ["dist/server.js", "init"], {
    env: { ...process.env, HOME: home, COSMOS_URL: "https://example.invalid" },
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let exitResolve!: (code: number) => void;
  const exited = new Promise<number>((r) => { exitResolve = r; });
  child.on("exit", (code) => exitResolve(code ?? 0));

  // Wait for the stderr line that announces the auth URL. The pattern
  // includes the state and port we need to drive the callback.
  const { state, port } = await new Promise<{ state: string; port: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for auth URL")), 5_000);
    let buf = "";
    child.stderr!.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const m = buf.match(/state=([a-f0-9]+)&redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve({ state: m[1], port: Number(m[2]) });
      }
    });
    child.on("error", reject);
  });

  await waitForPort(port);
  return { child, port, state, home, exited };
}

describe("bootstrap loopback", () => {
  // The init command compiles from dist/. Build is run by npm before
  // tests; if a developer forgets, fail fast with a clear hint.
  beforeAll(() => {
    if (!existsSync("dist/server.js")) {
      throw new Error("dist/server.js missing. Run `npm run build` first.");
    }
  });

  it("happy path: POST /callback-token (fragment-key)", async () => {
    const { port, state, home, exited } = await startBootstrap();

    // Browser GET — no key in query, server returns the in-page redirector.
    const get = await fetch(`http://127.0.0.1:${port}/callback?state=${state}&user_id=user-frag`);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type") || "").toContain("text/html");

    // In-page POST to hand off the fragment key.
    const post = await fetch(`http://127.0.0.1:${port}/callback-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "pmk_frag_test" }),
    });
    expect(post.status).toBe(200);

    const code = await exited;
    expect(code).toBe(0);

    const token = JSON.parse(readFileSync(join(home, ".config/cosmos-mcp/token"), "utf8"));
    expect(token.key).toBe("pmk_frag_test");
    expect(token.user_id).toBe("user-frag");
  });

  it("backward compat: key in query (old cosmos)", async () => {
    const { port, state, home, exited } = await startBootstrap();

    const get = await fetch(
      `http://127.0.0.1:${port}/callback?state=${state}&user_id=user-bc&key=pmk_legacy`,
    );
    expect(get.status).toBe(200);
    expect(await exited).toBe(0);

    const token = JSON.parse(readFileSync(join(home, ".config/cosmos-mcp/token"), "utf8"));
    expect(token.key).toBe("pmk_legacy");
    expect(token.user_id).toBe("user-bc");
  });

  it("state mismatch rejects + exits non-zero", async () => {
    const { port, exited } = await startBootstrap();
    const get = await fetch(`http://127.0.0.1:${port}/callback?state=wrong&user_id=u`);
    expect(get.status).toBe(400);
    const code = await exited;
    expect(code).not.toBe(0);
  });

  it("POST /callback-token without a prior GET returns 400", async () => {
    const { port, child } = await startBootstrap();
    const res = await fetch(`http://127.0.0.1:${port}/callback-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "pmk_orphan" }),
    });
    expect(res.status).toBe(400);
    child.kill();
  });

  it("?error=denied rejects + exits non-zero", async () => {
    const { port, state, exited } = await startBootstrap();
    const get = await fetch(`http://127.0.0.1:${port}/callback?state=${state}&error=denied`);
    expect(get.status).toBe(400);
    const code = await exited;
    expect(code).not.toBe(0);
  });
});
