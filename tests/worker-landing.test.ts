import { describe, expect, it } from "vitest";
import worker from "../worker/src/index";
import pkg from "../package.json" with { type: "json" };

async function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://mcp.polarity-lab.com${path}`));
}

describe("mcp landing worker", () => {
  it("renders the current installer story on / and /install", async () => {
    for (const path of ["/", "/install"]) {
      const res = await get(path);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(html).toContain("curl -fsSL https://mcp.polarity-lab.com/install.sh | sh");
      expect(html).toContain("Cosmos Sync.app");
      expect(html).toContain("Claude Desktop, Claude Code, Cursor, Codex, Zed, Continue");
      expect(html).toContain("why mcp.polarity-lab.com matters");
    }
  });

  it("keeps CTA buttons from clipping on narrow widths", async () => {
    const res = await get("/");
    const html = await res.text();

    expect(html).toMatch(/\.links\s*\{[\s\S]*display: grid;/);
    expect(html).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));");
    expect(html).toContain("overflow-wrap: anywhere;");
    expect(html).toContain("min-height: 50px;");
  });

  it("redirects the curl installer endpoint to the Cosmos script", async () => {
    const res = await get("/install.sh");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cosmos.polarity-lab.com/install.sh");
  });

  it("serves a server card with the package version", async () => {
    const res = await get("/.well-known/mcp/server-card.json");
    const card = await res.json() as { serverInfo: { version: string } };

    expect(res.status).toBe(200);
    expect(card.serverInfo.version).toBe(pkg.version);
  });

  it("serves registry metadata with the package version", async () => {
    const res = await get("/server.json");
    const metadata = await res.json() as { version: string; packages: Array<{ version: string }> };

    expect(res.status).toBe(200);
    expect(metadata.version).toBe(pkg.version);
    expect(metadata.packages[0]?.version).toBe(pkg.version);
  });
});
