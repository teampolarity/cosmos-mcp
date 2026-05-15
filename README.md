# cosmos-mcp

MCP server for the Polarity exocortex. Lets any MCP-capable LLM client (Claude Code, Claude Desktop, Cursor, Codex, Zed, Continue) read from and write to the user's personal knowledge graph in Cosmos.

The user signs in once, gets a per-user MCP key, and any agent they connect can now know them across sessions and apps. Observations made by one agent show up for the next. The graph is portable — exportable as a `polarity/v1` JSON file the user owns.

## Install

```bash
npx -y @polarity-lab/cosmos-mcp init
```

This opens your browser, signs you in at cosmos.polarity-lab.com, mints an MCP key, and saves it to `~/.config/cosmos-mcp/token`.

Then point your MCP client at the server. For Claude Code:

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

For Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) the same shape applies.

## Tools

Read:
- `polarity_whoami` — connectivity test; returns the polarity user id the key is bound to.
- `polarity_export` — full personal graph as `polarity/v1` JSON.
- `polarity_get_graph` — graph view, scoped by entity (`user`, `cosmos`, or `polarity`).
- `polarity_ask` — natural-language question, synthesized over the user's graph.

Write:
- `polarity_observe` — freeform observation. Kind defaults to `observation`; can be `event` or `preference`.
- `polarity_record_event` — convenience wrapper for events.
- `polarity_record_preference` — convenience wrapper for preferences.
- `polarity_dump` — location-anchored short message (PolarityGPS style).
- `polarity_checkin` — check-in at a waypoint, triggers co-presence detection.
- `polarity_declare` — declare future presence at a waypoint.

## Configuration

| Env var | Default | Notes |
|---------|---------|-------|
| `COSMOS_URL` | `https://cosmos.polarity-lab.com` | Override to point at a self-hosted cosmos. |
| `COSMOS_MCP_KEY` | (from token file) | `pmk_...` per-user key. Overrides the cached file. |
| `COSMOS_USER_ID` | (from token file) | Polarity user id. |
| `COSMOS_SYSTEM_KEY` | (unset) | Shared system key (e.g. `POLARITYGPS_SYSTEM_KEY`). When set, the server uses single-tenant mode: `X-System-Key` auth instead of `X-MCP-Key`, with `COSMOS_USER_ID` as the acting user. Use this if you run your own cosmos or for testing before the per-user MCP-key endpoints are deployed. |

## Self-hosting cosmos

The cosmos backend is open: [taiscoding/cosmos](https://github.com/taiscoding/cosmos). Run your own deploy, generate your own MCP key against it, set `COSMOS_URL` to your domain. The `.polarity` file you export stays yours.

## What this is

Most AI products build their own knowledge graph of you and keep it. Polarity inverts that. Your exocortex is one graph; any agent that holds your key can read and write to it. When you switch tools, the graph follows. When two agents both know you, they both contribute. The user, not the platform, owns the integration layer.

## License

MIT.
