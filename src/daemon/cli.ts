// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/daemon/cli.js
// `cosmos-mcp daemon <install|uninstall|status|kick>`
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadSyncConfig } from "./config.js";
import { applyDaemonConfig, getDaemonStatus, installDaemon, kickDaemon, uninstallDaemon, } from "./manage.js";
import { daemonPaths } from "./paths.js";
function packageRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
export async function runDaemonCli(sub, _rest) {
    if (platform() !== "darwin") {
        process.stderr.write("daemon is macOS-only (it uses launchd). on other platforms, schedule\n" +
            "  npx -y @polarity-lab/cosmos-mcp browser sync\n" +
            "  npx -y @polarity-lab/cosmos-mcp imessage sync\n" +
            "via cron instead.\n");
        return 1;
    }
    const action = (sub || "install").trim();
    const paths = daemonPaths();
    const root = packageRoot();
    if (action === "kick") {
        const r = kickDaemon();
        if (!r.ok) {
            process.stderr.write(`${r.error}\n`);
            return 1;
        }
        process.stdout.write(`kicked daemon. tail -f "${paths.logPath}" to watch.\n`);
        return 0;
    }
    if (action === "status") {
        const st = getDaemonStatus();
        process.stdout.write(`plist: ${st.installed ? st.plist_path : "(not installed)"}\n`);
        if (st.installed) {
            process.stdout.write(`runner: ${existsSync(paths.runnerPath) ? paths.runnerPath : "(missing!)"}\n`);
            process.stdout.write(`app:    ${st.app_path || "(missing!)"}\n`);
            process.stdout.write(`log:    ${paths.logPath}\n`);
            process.stdout.write(`interval: every ${st.config.interval_hours}h\n`);
            if (st.app_path && existsSync(st.app_path)) {
                const cs = spawnSync("/usr/bin/codesign", ["-dv", st.app_path], { encoding: "utf8" });
                const csOut = `${cs.stdout || ""}${cs.stderr || ""}`;
                const teamLine = csOut.split("\n").find((l) => l.includes("TeamIdentifier"));
                process.stdout.write(`signed: ${teamLine ? teamLine.trim() : "(no signature)"}\n`);
            }
            process.stdout.write(`loaded: ${st.loaded ? "yes" : "no"}\n`);
        }
        return 0;
    }
    if (action === "uninstall") {
        const r = uninstallDaemon();
        if (!r.ok) {
            process.stderr.write(`${r.error}\n`);
            return 1;
        }
        process.stdout.write("daemon uninstalled.\n");
        return 0;
    }
    if (action !== "install") {
        process.stderr.write("usage: cosmos-mcp daemon <install|uninstall|status|kick>\n");
        return 1;
    }
    const config = loadSyncConfig();
    const r = installDaemon(root, config);
    if (!r.ok) {
        process.stderr.write(`${r.error}\n`);
        return 1;
    }
    const { runMenuCli } = await import("./menu-cli.js");
    await runMenuCli("install");
    process.stdout.write("cosmos sync daemon + menu bar installed.\n");
    process.stdout.write("look for ◎ in the menu bar. grant Full Disk Access to ~/Applications/Cosmos Sync.app.\n");
    process.stdout.write(`logs: tail -f "${paths.logPath}"\n`);
    return 0;
}
export { applyDaemonConfig, getDaemonStatus, installDaemon, kickDaemon, uninstallDaemon };
