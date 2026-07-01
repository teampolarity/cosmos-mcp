#!/usr/bin/env bash
# One-command Chrome Web Store release. Bumps the patch version in both
# manifests, rebuilds the Chrome dist, uploads the zip to CWS via the
# v1.1 REST API, and (by default) publishes it.
#
# Setup (one time):
#   1. Mint a CWS-scoped OAuth client + refresh token via
#      ./scripts/chrome-refresh-token.sh (see that script for the
#      Cloud Console clicks).
#   2. Drop the four values in ~/.zshrc:
#        export CHROME_CLIENT_ID="..."
#        export CHROME_CLIENT_SECRET="..."
#        export CHROME_REFRESH_TOKEN="..."
#        export CHROME_EXTENSION_ID="..."       # 32-char id from CWS
#   3. source ~/.zshrc, then run this script.
#
# Usage:
#   ./scripts/chrome-publish.sh           bumps patch, builds, uploads, publishes (public)
#   ./scripts/chrome-publish.sh nobump    builds + uploads at current version
#   ./scripts/chrome-publish.sh draft     uploads only, leaves the new version as draft
#                                         in CWS dashboard so you can submit by hand
#
# Notes on the CWS API:
#   - Upload endpoint: PUT https://www.googleapis.com/upload/chromewebstore/v1.1/items/{id}
#     Body is the raw zip; Content-Type is x-zip or application/zip; takes
#     ~5-30s to chew through.
#   - Publish endpoint: POST .../chromewebstore/v1.1/items/{id}/publish
#     Pubishes the most recently uploaded draft to public. Subject to
#     CWS review; status returns OK + "PUBLISHED" or a review-required
#     state.
#   - Refresh tokens never expire unless revoked. Access tokens last 1h
#     and are minted fresh per run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-bump}"

for v in CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN CHROME_EXTENSION_ID; do
  if [ -z "${!v:-}" ]; then
    echo "$v must be set in the environment." >&2
    echo "see scripts/chrome-refresh-token.sh for the one-time setup." >&2
    exit 1
  fi
done

# Bump patch in both manifests so chrome and firefox stay in lockstep.
# Same logic the AMO publish script uses; keep them in sync.
if [ "$MODE" != "nobump" ] && [ "$MODE" != "draft" ]; then
  python3 - <<'PY'
import json
for name in ("manifest.chrome.json", "manifest.firefox.json"):
    with open(name) as f:
        m = json.load(f)
    parts = m["version"].split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    m["version"] = ".".join(parts)
    with open(name, "w") as f:
        json.dump(m, f, indent=2)
        f.write("\n")
    print(f"bumped {name} -> {m['version']}")
PY
fi

"$ROOT/scripts/build.sh" chrome

VERSION=$(python3 -c "import json; print(json.load(open('$ROOT/manifest.chrome.json'))['version'])")
ZIP="$ROOT/dist/cosmos-browser-extension-chrome.zip"

if [ ! -f "$ZIP" ]; then
  echo "expected zip at $ZIP not found." >&2
  exit 1
fi

echo ""
echo "------------------------------------------------------------"
echo "uploading version $VERSION to CWS item $CHROME_EXTENSION_ID"
echo "------------------------------------------------------------"

# Refresh the access token. Google's refresh endpoint takes form-encoded
# bodies; the response is JSON with an `access_token` field.
TOKEN_JSON=$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d client_id="$CHROME_CLIENT_ID" \
  -d client_secret="$CHROME_CLIENT_SECRET" \
  -d refresh_token="$CHROME_REFRESH_TOKEN" \
  -d grant_type=refresh_token)

ACCESS_TOKEN=$(printf '%s' "$TOKEN_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')

if [ -z "$ACCESS_TOKEN" ]; then
  echo "could not mint a CWS access token. response:" >&2
  echo "$TOKEN_JSON" >&2
  exit 1
fi

# Upload. The CWS API quirk: it always returns 200 even when uploadState
# is FAILURE — must inspect the JSON body, not just the HTTP status.
echo "uploading $(du -h "$ZIP" | awk '{print $1}') zip..."
UPLOAD_RES=$(curl -sS -X PUT \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$CHROME_EXTENSION_ID")

UPLOAD_STATE=$(printf '%s' "$UPLOAD_RES" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("uploadState",""))')

if [ "$UPLOAD_STATE" != "SUCCESS" ]; then
  echo "upload failed (state=$UPLOAD_STATE). raw response:" >&2
  echo "$UPLOAD_RES" >&2
  exit 1
fi

echo "  upload OK"

if [ "$MODE" = "draft" ]; then
  echo ""
  echo "left as draft in CWS dashboard. submit by hand at:"
  echo "  https://chrome.google.com/webstore/devconsole/?item_id=$CHROME_EXTENSION_ID"
  exit 0
fi

# Publish. publishTarget defaults to "default" (public). Use
# "trustedTesters" for private testers via a CWS group.
echo "publishing..."
PUBLISH_RES=$(curl -sS -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/$CHROME_EXTENSION_ID/publish")

PUBLISH_STATUS=$(printf '%s' "$PUBLISH_RES" | python3 -c '
import sys, json
d = json.load(sys.stdin)
sl = d.get("status", [])
sd = d.get("statusDetail", [])
print(",".join(sl), "::", " | ".join(sd))
')

echo "  publish: $PUBLISH_STATUS"

# OK means accepted into review and (for established items) live within
# minutes; "ITEM_PENDING_REVIEW" is also a normal first-time path.
case "$PUBLISH_RES" in
  *'"OK"'*) echo "done. live build $VERSION submitted." ;;
  *)
    echo ""
    echo "publish endpoint returned a non-OK status. raw response:" >&2
    echo "$PUBLISH_RES" >&2
    exit 1
    ;;
esac
