const { spawn } = require("child_process");

const proc = spawn("node", ["index.js"], {
  env: { ...process.env, COSMOS_MCP_KEY: process.env.COSMOS_MCP_KEY }
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
      console.log(JSON.stringify(msg, null, 2));
    } catch (e) {
      console.log("RAW:", line);
    }
  }
});

proc.stderr.on("data", (d) => {
  console.error("STDERR:", d.toString().trim());
});

const send = (obj) => {
  proc.stdin.write(JSON.stringify(obj) + "\n");
};

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "kimi-cli", version: "1.0.0" } } });

setTimeout(() => {
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
}, 300);

setTimeout(() => {
  send({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "cosmos_capture_turn",
      arguments: {
        user_text: "this is not just about this conversation, it is about upgrading everything. you can see the cosmos backend in the /cosmos folder in my home folder",
        assistant_text: "The user wants real-time capture. I am looking at the cosmos backend code in ~/cosmos to understand how to wire turn-by-turn capture into the MCP endpoint.",
        source: "kimi-code"
      }
    }
  });
}, 600);

setTimeout(() => {
  proc.kill();
}, 15000);
