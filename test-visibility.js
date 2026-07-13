const { spawn } = require("child_process");

const KEY = process.env.COSMOS_MCP_KEY;

function callTool(name, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["index.js"], {
      env: { ...process.env, COSMOS_MCP_KEY: KEY }
    });

    let buffer = "";
    proc.stdout.on("data", (d) => {
      buffer += d.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2) resolve(msg);
        } catch {}
      }
    });

    proc.stderr.on("data", (d) => {});

    const send = (obj) => proc.stdin.write(JSON.stringify(obj) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "kimi-cli", version: "1.0.0" } } });
    setTimeout(() => send({ jsonrpc: "2.0", method: "notifications/initialized" }), 300);
    setTimeout(() => {
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
    }, 600);
    setTimeout(() => proc.kill(), 15000);
  });
}

async function main() {
  console.log("=== Capture turn ===");
  const c1 = await callTool("cosmos_capture_turn", {
    user_text: "Visibility test. Can the backend see this node immediately after capture?",
    assistant_text: "Testing immediate visibility of captured nodes in the graph.",
    source: "kimi-code"
  });
  console.log(c1.result.content[0].text);

  console.log("\n=== Query for the node immediately ===");
  const q1 = await callTool("cosmos_query", { query: "visibility test captured node" });
  console.log(q1.result.content[0].text.slice(0, 500));
}

main().catch(console.error);
