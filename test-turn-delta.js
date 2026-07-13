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
  console.log("=== Capture turn 1 ===");
  const c1 = await callTool("cosmos_capture_turn", {
    user_text: "I want per-turn delta so I can see how my graph changes after every conversation, not just monthly.",
    assistant_text: "Deploying per-turn micro-delta now. The backend will compare node weights between consecutive turns and surface intensifying, dropping, new, and stable themes in real time.",
    source: "kimi-code"
  });
  console.log(c1.result.content[0].text);

  console.log("\n=== Query delta (should show micro-delta) ===");
  const d1 = await callTool("cosmos_delta", {});
  console.log(d1.result.content[0].text);

  console.log("\n=== Capture turn 2 ===");
  const c2 = await callTool("cosmos_capture_turn", {
    user_text: "Actually I also want path tracking to auto-consolidate similar paths and shift categorizations as evidence accumulates.",
    assistant_text: "The path system already has tracking and deduplication. After each regeneration, existing paths are refreshed with present or fading status. I am looking at making new paths auto-track as well.",
    source: "kimi-code"
  });
  console.log(c2.result.content[0].text);

  console.log("\n=== Query delta again (should show changes) ===");
  const d2 = await callTool("cosmos_delta", {});
  console.log(d2.result.content[0].text);
}

main().catch(console.error);
