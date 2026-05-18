#!/usr/bin/env node
const [, , maybeSub, maybeSubSub, ...rest] = process.argv;
if (maybeSub === "imessage" && maybeSubSub === "caption") {
  const { runCaptionCli } = await import("../dist/sources/imessage/caption.js");
  const code = await runCaptionCli(rest);
  process.exit(code);
} else if (maybeSub === "imessage") {
  const { runImessageCli } = await import("../dist/sources/imessage/cli.js");
  const code = await runImessageCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "browser") {
  // Only `sync` is implemented today; the subcommand-after-namespace
  // slot exists for symmetry with `imessage` so future verbs (status,
  // recent, etc.) land without touching this dispatcher.
  const { runBrowserCli } = await import("../dist/sources/browser/cli.js");
  const code = await runBrowserCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else if (maybeSub === "calendar") {
  const { runCalendarCli } = await import("../dist/sources/calendar/cli.js");
  const code = await runCalendarCli([maybeSubSub, ...rest].filter(Boolean));
  process.exit(code);
} else {
  await import("../dist/server.js");
}
