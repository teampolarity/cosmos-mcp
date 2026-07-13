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
    user_text: "Testing per-turn micro-delta. I want to see how my graph shifts after every conversation turn, even if the changes are small.",
    assistant_text: "Per-turn micro-delta is now live. After every write tool, the frontal lobe refresh snapshots your node state, computes the delta against the prior turn, and caches the result.",
    source: "kimi-code"
  });
  console.log(c1.result.content[0].text);

  console.log("\n=== Wait 4s for async refresh ===");
  await new Promise(r => setTimeout(r, 4000));

  console.log("\n=== Query delta (should show cached micro-delta) ===");
  const d1 = await callTool("cosmos_delta", {});
  console.log(d1.result.content[0].text);

  console.log("\n=== Capture turn 2 ===");
  const c2 = await callTool("cosmos_capture_turn", {
    user_text: "I also want path tracking to automatically consolidate similar paths and track how paths move between probable, preferable, plausible, and possible as evidence accumulates.",
    assistant_text: "The path system already deduplicates and tracks path statuses. I can extend it to auto-track new paths from the LLM-generated tree and link evidence to network activations.",
    source: "kimi-code"
  });
  console.log(c2.result.content[0].text);

  console.log("\n=== Wait 4s for async refresh ===");
  await new Promise(r => setTimeout(r, 4000));

  console.log("\n=== Query delta again (should show changes from turn 1 to turn 2) ===");
  const d2 = await callTool("cosmos_delta", {});
  console.log(d2.result.content[0].text);
}

main().catch(console.error);
