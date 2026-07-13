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
  console.log("=== Step 1: Capture a turn ===");
  const capture = await callTool("cosmos_capture_turn", {
    user_text: "I want Cosmos to be an autonomous frontal lobe for AI agents. After every conversation turn, it should update my path, delta, and networks automatically so the next response is informed by live synthesized state.",
    assistant_text: "Understood. I have just deployed the autonomous frontal lobe refresh to the Cosmos backend. After every write tool call, the backend now recomputes networks, regenerates node snapshots + theme periods for delta, and rebuilds the futures path tree.",
    source: "kimi-code"
  });
  console.log(capture.result.content[0].text);

  console.log("\n=== Step 2: Wait 3s for async refresh ===");
  await new Promise(r => setTimeout(r, 3000));

  console.log("\n=== Step 3: Query path ===");
  const path = await callTool("cosmos_path", {});
  console.log(path.result.content[0].text);

  console.log("\n=== Step 4: Query delta ===");
  const delta = await callTool("cosmos_delta", {});
  console.log(delta.result.content[0].text);

  console.log("\n=== Step 5: Query networks ===");
  const networks = await callTool("cosmos_networks", {});
  console.log(networks.result.content[0].text);
}

main().catch(console.error);
