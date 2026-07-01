# Cosmos MCP — browser extension

The browser surface of [Cosmos MCP](https://mcp.polarity-lab.com). A Chrome and Firefox WebExtension that ships the pages you actually read into your Cosmos graph at [cosmos.polarity-lab.com](https://cosmos.polarity-lab.com).

This folder is part of the `cosmos-mcp` repo, not a separate project. It sits next to the desktop CLI (`src/sources/browser/`) and shares the same filter rules, the same Cosmos endpoint, and the same idempotency contract. The CLI is for Mac users with a terminal. The extension is the cross-platform surface for everyone else.

Listed on the Chrome Web Store as **cosmos by polarity lab** ([listing](https://chromewebstore.google.com/detail/cosmos-by-polarity-lab/jomeclciefpboanjnlfcdfgfjalldfno)) and signed by Mozilla AMO for Firefox.

## What it does

1. Once an hour the service worker walks `chrome.history.search` for visits since the last sync.
2. The raw list runs through the same noise filter the CLI uses (`shared/filter-rules.json`, copied from `../src/sources/browser/filter-rules.json`).
3. Whatever survives gets POSTed in batches of 200 to `https://cosmos.polarity-lab.com/api/me/connectors/browser/visits` with the user's MCP key in the `X-MCP-Key` header.

## What it sends

Per page: URL, title, hostname, last-visit timestamp, visit count, the static string `"web"` as source.

It does not send page bodies, cookies, form data, request headers, or analytics. Everything not on that list is dropped before the network call.

## Install for the user

The published builds in the Chrome Web Store and the Firefox Add-ons listing are the supported paths. For local dev:

### Chrome

1. `./scripts/build.sh chrome` to produce `dist/chrome/`.
2. Open `chrome://extensions`, enable Developer mode, click Load unpacked, point at `dist/chrome/`.
3. Click the extension toolbar icon and open Options. Paste your `pmk_…` MCP key. Click Sync now.

### Firefox

1. `./scripts/build.sh firefox` to produce `dist/firefox/`.
2. Open `about:debugging#/runtime/this-firefox`, click Load Temporary Add-on, select any file inside `dist/firefox/` (e.g. `manifest.json`).
3. Same options flow.

## Minting a Cosmos MCP key

1. Sign in at <https://cosmos.polarity-lab.com/connectors>.
2. In the MCP clients section, click **+ add**, name it `browser-extension`.
3. Copy the `pmk_…` string and paste it into the extension Options page.

## Layout

```
manifest.chrome.json          Chrome MV3 manifest
manifest.firefox.json         Firefox MV3 manifest (gecko block, scripts: [])
background.js                 service worker (alarms, sync, fetch)
filter.js                     JS port of cosmos-mcp's filter.ts
shared/filter-rules.json      canonical noise lists (synced from ../src/sources/browser/)
popup.html / popup.js         toolbar icon UI
options.html / options.js     settings page
icons/                        16/48/128 PNG icons
scripts/build.sh              build per target into dist/<target>/
scripts/sync-filter-rules.sh  pull filter-rules.json from the CLI side of this repo
scripts/amo-publish.sh        Mozilla AMO publish flow (web-ext sign)
scripts/chrome-publish.sh     Chrome Web Store publish flow (CWS API)
scripts/chrome-refresh-token.sh  one-shot helper to mint the CWS refresh token
```

## Keeping filter rules in sync

The source of truth is `../src/sources/browser/filter-rules.json` (the CLI side, in this same repo). Edit there, run `npm run build` and `npm test` at the cosmos-mcp root to confirm it still compiles, then:

```bash
./scripts/sync-filter-rules.sh
```

This copies the JSON into `shared/`. Rebuild and reload the extension afterwards.

## Publishing

Both store flows live in this folder. Run them from this directory:

```bash
./scripts/amo-publish.sh             # Mozilla AMO, unlisted channel by default
./scripts/amo-publish.sh listed      # Mozilla AMO, public listing
./scripts/chrome-publish.sh draft    # Chrome Web Store, upload only (submit by hand)
./scripts/chrome-publish.sh          # Chrome Web Store, upload + auto-submit
```

Both scripts bump the patch version in `manifest.chrome.json` and `manifest.firefox.json` together so the two stores stay in lockstep.

Credentials live in `~/.zshrc`:
- `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` for Mozilla
- `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, `CHROME_EXTENSION_ID` for Chrome

If the Chrome refresh token is ever revoked, re-mint it with `./scripts/chrome-refresh-token.sh`.

## Privacy

- No analytics SDKs. The extension talks to `cosmos.polarity-lab.com` and nowhere else.
- Open source. The whole package the user installs is the same code in this folder.
- The MCP key lives in `chrome.storage.local`, scoped to the extension, never synced.
- "Clear" in Options wipes the key and the watermark from local storage.

## License

MIT, same as the rest of `cosmos-mcp`.
