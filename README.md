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
| **Notion** | OAuth at [cosmos.polarity-lab.com/connectors](https://cosmos.polarity-lab.com/connectors). Pick the pages and databases you want shared. | Each Notion page becomes a `source_page` node, keyed by Notion id, kept fresh by a daily sync. |
| **Obsidian** | Community plugin: [polarity-lab/obsidian-cosmos](https://github.com/teampolarity/obsidian-cosmos). Paste your `pmk_` key, point at your vault. | Each note becomes a `source_page` node keyed by vault-relative path. Tags and wikilinks resolve into edges. |
| **MCP clients** | This package. | Observations, events, preferences, location dumps, check-ins, declarations. |
| **Direct API** | `POST /api/polarity/observe` with your key. | Anything you can express as an observation. |

Unchanged pages are skipped server-side, so re-syncing a quiet vault or stable Notion workspace costs almost nothing.

## Configuration

| Env var | Default | When you set it |
|---|---|---|
| `COSMOS_URL` | `https://cosmos.polarity-lab.com` | Pointing at your own cosmos. |
| `COSMOS_MCP_KEY` | (from token file) | `pmk_...` per-user key. Overrides cache. |
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
