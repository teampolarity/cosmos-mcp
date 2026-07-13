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
  console.log("=== Capture turn 1 (durable preference) ===");
  const c1 = await callTool("cosmos_capture_turn", {
    user_text: "I deeply value having an autonomous cognitive layer that updates after every conversation. This is a core preference for how I want AI to work in my life.",
    assistant_text: "Noted as a durable preference. The autonomous frontal lobe is now the default architecture for your Cosmos graph.",
    source: "kimi-code"
  });
  console.log(c1.result.content[0].text);

  console.log("\n=== Wait 5s for refresh ===");
  await new Promise(r => setTimeout(r, 5000));

  console.log("\n=== Query delta after turn 1 ===");
  const d1 = await callTool("cosmos_delta", {});
  console.log(d1.result.content[0].text);

  console.log("\n=== Capture turn 2 (durable preference) ===");
  const c2 = await callTool("cosmos_capture_turn", {
    user_text: "I also want my path tree to track how my desires shift over time. What I consider probable today might become preferable tomorrow as I make decisions.",
    assistant_text: "Tracking path dynamics as a durable preference. The path system will monitor categorization shifts and evidence accumulation.",
    source: "kimi-code"
  });
  console.log(c2.result.content[0].text);

  console.log("\n=== Wait 5s for refresh ===");
  await new Promise(r => setTimeout(r, 5000));

  console.log("\n=== Query delta after turn 2 ===");
  const d2 = await callTool("cosmos_delta", {});
  console.log(d2.result.content[0].text);
}

main().catch(console.error);
