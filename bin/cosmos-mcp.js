#!/usr/bin/env node
const [, , maybeSub, ...rest] = process.argv;
if (maybeSub === "imessage") {
  const { runImessageCli } = await import("../dist/sources/imessage/cli.js");
  const code = await runImessageCli(rest);
  process.exit(code);
} else {
  await import("../dist/server.js");
}
