# cosmos-mcp

`@polarity-lab/cosmos-mcp` — the MCP gateway to Cosmos. Any MCP-capable client (Claude Desktop, Cursor, Codex, Zed, Continue, Claude Code) reads and writes the same personal knowledge graph hosted at `cosmos.polarity-lab.com`.

- npm: `@polarity-lab/cosmos-mcp` under the `wearepolarity` account
- Repo: `teampolarity/cosmos-mcp` (GitHub User, not Org — admin actions need a PAT minted from that account)
- Landing: `mcp.polarity-lab.com` (README drives the page + Glama listing)
- Backend talked to: `cosmos.polarity-lab.com` (the `cosmos-fork` Pages project)

## Layout

- `bin/cosmos-mcp.js` — CLI entrypoint. Dispatches subcommands and resolves the user key.
- `src/server.ts` → `dist/server.js` — the MCP stdio server. `npm start` runs this.
- `src/tools/` — the 11 read/write tools exposed to MCP clients.
- `src/sources/` — local CLI source connectors (`imessage`, `browser`, `calendar`).
- `src/daemon/` — scaffolding for the signed `Cosmos Sync.app` LaunchAgent (0.6.0+, npm publish blocked on lab Apple Dev account transition).
- `src/auth/` — key handling, `provision`, `install-handler` for the `cosmos-mcp://` URL scheme.
- `tests/` — vitest. Run via `npm test`.

## Tools (authoritative list in `src/tools/index.ts`)

- Read: `polarity_whoami`, `polarity_export`, `polarity_get_graph`, `polarity_ask`
- Write: `polarity_observe`, `polarity_record_event`, `polarity_record_preference`, `polarity_capture_turn` (preferred for whole user/assistant exchanges), `polarity_dump`, `polarity_checkin`, `polarity_declare`

When adding a new tool, update both `src/tools/index.ts` and the README "Tools" table — Glama re-crawls README on every publish.

## CLI subcommands

- `provision <pmk_xxx>` — validates against `/api/polarity/whoami` (header `X-MCP-Key`, NOT Bearer), writes to macOS system keychain (`security add-generic-password -a "cosmos-mcp" -s "cosmos-mcp-key"`), AND mirrors to legacy `~/.config/cosmos-mcp/token` so the stdio server keeps working. macOS-only.
- `install-handler` — writes a `cosmos-mcp://` URL handler `.app` bundle to `~/Library/Application Support/cosmos-mcp/cosmos-mcp-handler.app/`, registers via `lsregister`. One-time per machine. Makes `cosmos-mcp://provision?key=pmk_...` clickable from the browser.
- `imessage probe` — no-op Full Disk Access check. Reports chat count + latest message timestamp without iterating. Run after granting FDA to confirm before a real sync.
- `imessage sync`, `browser sync`, `calendar sync` — read the key via `resolveKey()` precedence: `COSMOS_TOKEN` env → `COSMOS_MCP_KEY` env → keychain. CI keeps working.

## iMessage is the headline source

When describing what cosmos-mcp does, lead with iMessage. v1.1 ships text content, not just metadata. AddressBook resolves contact names onto person nodes. Three-rule slop filter (no-reply, short-code, low-volume) keeps the graph clean. Requires Full Disk Access on Terminal.

The connectors landing tile in `cosmos-fork/public/connectors.html` is still copy-stale at "v1 is metadata only" — fix before that surface goes into any marketing.

## Publish flow

From this directory:

```bash
npm version patch --no-git-tag-version
npm run build
npm publish --access public
git tag v0.X.Y && git push origin v0.X.Y
```

The repo-local `.npmrc` is gitignored and holds the npm token. README + keywords feed the Glama crawl — update README before publishing if the listing should change.

## Daemon `.app` (0.6.0)

Scaffolded for a signed `Cosmos Sync.app` LaunchAgent that runs `imessage sync` on a schedule. Code is in `src/daemon/`. npm publish is blocked until the lab Apple Developer account finishes transferring from Theo's personal account. Do not publish 0.6.0 to npm until that lands — the unsigned binary will SmartScreen-block users.

## Don't

- Don't switch the MCP-key header to `Authorization: Bearer` — the backend rejects it. Always `X-MCP-Key: pmk_xxx`.
- Don't cache the keychain entry in the stdio server process. The key can rotate; resolve per-call.
- Don't add a new source connector without also adding a `Sources` row in README and in `~/.claude/projects/-Users-shadrack-projects/memory/project_cosmos_mcp.md`.
