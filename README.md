<p align="center">
  <a href="https://mcp.polarity-lab.com"><img src="assets/polarity-mark.svg" alt="Polarity" width="180" /></a>
</p>

<h1 align="center">cosmos-mcp</h1>

<p align="center">
  One exocortex. Every agent.<br/>
  <sub>MCP server for your Cosmos graph.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@polarity-lab/cosmos-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@polarity-lab/cosmos-mcp?style=flat-square&color=000" /></a>
  <a href="https://github.com/teampolarity/cosmos-mcp/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@polarity-lab/cosmos-mcp?style=flat-square&color=000" /></a>
  <a href="https://mcp.polarity-lab.com"><img alt="site" src="https://img.shields.io/badge/site-mcp.polarity--lab.com-000?style=flat-square" /></a>
  <a href="https://glama.ai/mcp/servers/@teampolarity/cosmos-mcp"><img alt="glama" src="https://img.shields.io/badge/listed%20on-glama-000?style=flat-square" /></a>
</p>

---

Every AI you use is building its own private graph of you. Claude has one. ChatGPT has one. Cursor has one. None of them talk to each other, and none of them are yours.

Cosmos inverts that. Your knowledge graph lives in one place, and any MCP-capable client (Claude Code, Claude Desktop, Cursor, Codex, Zed, Continue) reads and writes to the same one. When an agent notices something durable about you, it lands in the graph. When you switch tools, the graph follows. The user, not the platform, owns the integration layer.

The thing you carry is a `.polarity` file. Yours.

## Provisioning

There are two ways to get a `pmk_…` key onto your Mac.

**Automatic.** Sign in at [cosmos.polarity-lab.com/connectors](https://cosmos.polarity-lab.com/connectors), tap "open in cosmos-mcp." The OS opens a one-shot handler that writes the key into your system keychain. You never see the raw key.

For that deep link to work, register the URL scheme once:

```bash
npx -y @polarity-lab/cosmos-mcp install-handler
```

This drops a tiny `.app` into `~/Library/Application Support/cosmos-mcp/` and registers `cosmos-mcp://` with Launch Services. macOS-only.

**Manual.** If you already have a `pmk_…` key, or you do not want to install the handler:

```bash
npx -y @polarity-lab/cosmos-mcp provision pmk_xxx
```

The CLI validates the key against cosmos, then stores it in the macOS system keychain under service `cosmos-mcp-key`. Subsequent `imessage sync`, `browser sync`, `calendar sync` calls read from the keychain. No env var needed.

**Confirm iMessage access.**

```bash
npx -y @polarity-lab/cosmos-mcp imessage probe
```

Verifies Full Disk Access is granted and reports how many chats are visible. If you see an EACCES message, open System Settings, Privacy & Security, Full Disk Access, and add Terminal (or whichever app runs the CLI).

**CI and self-hosters.** Set `COSMOS_TOKEN=pmk_…` in env. It takes precedence over the keychain, so existing pipelines keep working untouched.

## Install

```bash
npx -y @polarity-lab/cosmos-mcp init
```

Opens your browser. Sign in at cosmos.polarity-lab.com, approve a per-user key, and the token lands at `~/.config/cosmos-mcp/token` (0600). Then point any MCP client at it:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "@polarity-lab/cosmos-mcp"]
    }
  }
}
```

That config drops into `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop, your `.cursor/mcp.json` for Cursor, the equivalent for whichever client.

## What you get

Eleven tools, four read, seven write.

**Read**

| Tool | Calls | What it returns |
|---|---|---|
| `polarity_whoami` | `GET /api/polarity/whoami` | Bound user + scopes. Cheap probe. |
| `polarity_export` | `POST /api/polarity/export` | Full personal graph as `polarity/v1` JSON. |
| `polarity_get_graph` | `GET /api/polarity` | Graph view, scoped by entity (`user`, `cosmos`, `polarity`). |
| `polarity_ask` | `POST /api/polarity/ask` | NL question synthesized over the graph. |

**Write**

| Tool | Calls | What it does |
|---|---|---|
| `polarity_observe` | `POST /api/polarity/observe` | Freeform observation. Cosmos extracts. |
| `polarity_record_event` | `POST /api/polarity/observe` (kind=event) | Something happened at a point in time. |
| `polarity_record_preference` | `POST /api/polarity/observe` (kind=preference) | A like, dislike, working-style rule. |
| `polarity_capture_turn` | `POST /api/polarity/capture-turn` | Hand a whole user/assistant exchange to cosmos. Pulls every durable observation in one call. Prefer over multiple `polarity_observe` calls. |
| `polarity_dump` | `POST /api/polarity/dump` | Location-anchored short message. |
| `polarity_checkin` | `POST /api/polarity/checkin` | Check-in at a waypoint. Triggers co-presence detection. |
| `polarity_declare` | `POST /api/polarity/declare` | Declare future presence at a waypoint. |

## Sources

The MCP server is one way to write to the graph. Cosmos accepts source pages from anywhere you keep notes, and the MCP read tools see all of it through the same view.

| Source | How it connects | What lands |
|---|---|---|
| **iMessage** | Local CLI: `npx -y @polarity-lab/cosmos-mcp imessage sync`. Mac only. Grant Terminal Full Disk Access first. | Conversational turns from `chat.db`, with text content. People appear as person nodes in your graph, sized by conversation weight, named via your local AddressBook, dated by your real message timestamps. |
| **Claude Desktop** | Local CLI: `npx -y @polarity-lab/cosmos-mcp claude-desktop sync`. Reads Claude Code session transcripts at `~/.claude/projects/`. | Every Claude Code session becomes a thread node; user and assistant turns land in `conversation_turns` with full text. Tool-use plumbing is stripped client-side. |
| **Shell history** | Local CLI: `npx -y @polarity-lab/cosmos-mcp shell-history sync`. Reads `~/.zsh_history` (falls back to bash/fish) with a byte-offset watermark. | Each sync window lands as one `source_page` keyed by `shell-history:<sync-iso>`, body = newline-joined commands. Trivial commands (`ls`, `cd ..`, single chars) and consecutive duplicates are filtered client-side. |
| **Notion** | OAuth at [cosmos.polarity-lab.com/connectors](https://cosmos.polarity-lab.com/connectors). Pick the pages and databases you want shared. | Each Notion page becomes a `source_page` node, keyed by Notion id, kept fresh by a daily sync. |
| **Obsidian** | Community plugin: [polarity-lab/obsidian-cosmos](https://github.com/teampolarity/obsidian-cosmos). Paste your `pmk_` key, point at your vault. | Each note becomes a `source_page` node keyed by vault-relative path. Tags and wikilinks resolve into edges. |
| **MCP clients** | This package. | Observations, events, preferences, location dumps, check-ins, declarations. |
| **Direct API** | `POST /api/polarity/observe` with your key. | Anything you can express as an observation. |

Unchanged pages are skipped server-side, so re-syncing a quiet vault or stable Notion workspace costs almost nothing. The iMessage sync is incremental too, watermarked on the last successful run, so re-running it is a no-op until new messages arrive.

### iMessage sync

`cosmos-mcp` ships an `imessage` subcommand that reads your local Messages database and lands every conversation in your graph.

```bash
# default: incremental sync, 90-day window on first run
npx -y @polarity-lab/cosmos-mcp imessage sync

# re-sync the original 90-day window regardless of watermark
npx -y @polarity-lab/cosmos-mcp imessage sync --backfill

# pull everything since a specific date
npx -y @polarity-lab/cosmos-mcp imessage sync --since 2024-01-01

# check what the last run did
npx -y @polarity-lab/cosmos-mcp imessage status
```

A three-rule slop filter (no-reply senders, short-code numbers, low-volume contacts) keeps the graph clean. Your AddressBook resolves phone numbers and emails into real contact names. The reading is local to your Mac; only the extracted, normalized turns go into your cosmos graph, which is your account.

### Claude Desktop sync

`cosmos-mcp` ships a `claude-desktop` subcommand that watches Claude Code session transcripts and lands each turn in your graph. The desktop chat surface itself stores conversations server-side, so the live, watchable on-disk source is `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.

```bash
# default: incremental, watermarked per session
npx -y @polarity-lab/cosmos-mcp claude-desktop sync

# limit to recent activity
npx -y @polarity-lab/cosmos-mcp claude-desktop sync --since 2026-05-01

# scan and report without shipping
npx -y @polarity-lab/cosmos-mcp claude-desktop sync --dry-run

# see what the last run did
npx -y @polarity-lab/cosmos-mcp claude-desktop status
```

Tool-use blocks, hook plumbing, and sub-agent (sidechain) turns are stripped client-side; only the visible text the user and the assistant exchanged is shipped. Each session id becomes its own thread node, keyed by `(user_id, "claude-desktop", session_id)`.

### Background sync (macOS)

`cosmos-mcp daemon install` drops a LaunchAgent that ticks every four hours and runs the browser, iMessage, calendar, claude-desktop, and shell-history syncs back-to-back. The agent fires a signed, notarized `Cosmos Sync.app` bundle that ships inside the npm package and gets copied into `~/Applications/Cosmos Sync.app` at install time.

```bash
npx -y @polarity-lab/cosmos-mcp daemon install
```

After install, grant the bundle Full Disk Access once:

1. open System Settings → Privacy & Security → Full Disk Access
2. click +, then drag `~/Applications/Cosmos Sync.app` into the list
3. make sure the checkbox next to it is on
4. run `cosmos-mcp daemon kick` to fire a tick now

Browser sync works without that step. iMessage and Calendar need it because they read TCC-protected SQLite databases on the user side. `cosmos-mcp daemon status` reports the signing team id, the plist + runner paths, and whether launchd has the agent loaded. `cosmos-mcp daemon uninstall` removes the plist, runner, and `~/Applications/Cosmos Sync.app`.

## Configuration

| Env var | Default | When you set it |
|---|---|---|
| `COSMOS_URL` | `https://cosmos.polarity-lab.com` | Pointing at your own cosmos. |
| `COSMOS_TOKEN` | (from keychain) | `pmk_...` per-user key for CLI subcommands. Takes precedence over the macOS keychain entry. Set this in CI. |
| `COSMOS_MCP_KEY` | (from token file) | `pmk_...` per-user key. Honored for back-compat. |
| `COSMOS_USER_ID` | (from token file) | Polarity user id. |
| `COSMOS_SYSTEM_KEY` | (unset) | Single-tenant mode. Sends `X-System-Key` instead of `X-MCP-Key`. Requires `COSMOS_USER_ID`. For self-hosters or testing before per-user keys are deployed. |

## Self-hosting

The cosmos backend is open. Run [taiscoding/cosmos](https://github.com/taiscoding/cosmos) on your own Cloudflare account, mint a key against your instance, set `COSMOS_URL` to your domain. The graph stays on your D1. The `.polarity` export still works.

## The pitch in three lines

> Your AI tools each know fragments of you. They are not allowed to share.
> Cosmos is the layer that lets them. You hold the key. The graph is portable.
> When you leave, you take the understanding with you.

## License

MIT.
