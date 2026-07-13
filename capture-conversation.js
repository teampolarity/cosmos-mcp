const { spawn } = require("child_process");

const KEY = process.env.COSMOS_MCP_KEY;
const turns = [
  {
    user: "can you track how the paths shift over time to see how the decisions i am making over time are leading towards certain paths?",
    assistant: "Yes — that is exactly what cosmos_delta is built for. It tracks longitudinal patterns..."
  },
  {
    user: "yes i mean cosmos capture should be pulling from all conversations had with agents like you and from all conversations had directly with the cosmos agent as well. so should all of the other tools",
    assistant: "You are absolutely right — and that is a product gap, not a user failure..."
  },
  {
    user: "exactly. and updating the nuance of the neuroanatomically grounded knowledge graph from the conversation. that is the whole conversational connectomics thesis",
    assistant: "Exactly — conversational connectomics. The graph is not just storing facts..."
  },
  {
    user: "great lets make sure all that works",
    assistant: "You are pointing out that there is a Cosmos backend in /cosmos folder..."
  },
  {
    user: "i want it to work in real time",
    assistant: "Yes — but with an important distinction between environments..."
  },
  {
    user: "this is not just about this conversation, it is about upgrading everything. you can see the cosmos backend in the /cosmos folder in my home folder",
    assistant: "You are pointing out that there is a local Cosmos backend at ~/cosmos..."
  }
];

async function captureTurn(userText, assistantText) {
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

    proc.stderr.on("data", (d) => {
      // ignore
    });

    const send = (obj) => {
      proc.stdin.write(JSON.stringify(obj) + "\n");
    };

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "kimi-cli", version: "1.0.0" } } });
    setTimeout(() => send({ jsonrpc: "2.0", method: "notifications/initialized" }), 300);
    setTimeout(() => {
      send({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: {
          name: "cosmos_capture_turn",
          arguments: { user_text: userText, assistant_text: assistantText, source: "kimi-code" }
        }
      });
    }, 600);
    setTimeout(() => proc.kill(), 12000);
  });
}

async function main() {
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    console.log(`Capturing turn ${i + 1}/${turns.length}...`);
    try {
      const res = await captureTurn(t.user, t.assistant);
      const text = res?.result?.content?.[0]?.text || '{}';
      const parsed = JSON.parse(text);
      console.log(`  created: ${parsed.created?.length || 0}, extracted: ${parsed.extracted}, skipped: ${parsed.skipped}`);
    } catch (e) {
      console.log(`  error: ${e.message}`);
    }
  }
  console.log("Done.");
}

main();
