#!/usr/bin/env bash
# One-command AMO release. Bumps the patch version in both manifests,
# rebuilds the Firefox dist, and uploads via web-ext sign. AMO returns
# a signed .xpi which lands in dist/web-ext-artifacts/.
#
# Setup (one time):
#   1. Visit https://addons.mozilla.org/developers/addon/api/key/
#      and click "Generate new credentials". You'll get a JWT issuer
#      ("user:xxxx") and a JWT secret (a 64-char hex string).
#   2. Drop them in ~/.zshrc:
#        export AMO_JWT_ISSUER="user:..."
#        export AMO_JWT_SECRET="..."
#   3. source ~/.zshrc, then run this script.
#
# Usage:
#   ./scripts/amo-publish.sh           bumps patch, builds, signs, uploads
#   ./scripts/amo-publish.sh nobump    builds + uploads at current version
#   ./scripts/amo-publish.sh listed    same as default but channel=listed
#                                      (default channel is "unlisted" so the
#                                      add-on is signed but not made public)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-bump}"
CHANNEL="unlisted"
[ "$MODE" = "listed" ] && CHANNEL="listed"

if [ -z "${AMO_JWT_ISSUER:-}" ] || [ -z "${AMO_JWT_SECRET:-}" ]; then
  echo "AMO_JWT_ISSUER and AMO_JWT_SECRET must be set in the environment." >&2
  echo "Get them from https://addons.mozilla.org/developers/addon/api/key/" >&2
  exit 1
fi

if [ "$MODE" != "nobump" ]; then
  python3 - <<'PY'
import json
for name in ("manifest.firefox.json", "manifest.chrome.json"):
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

"$ROOT/scripts/build.sh" firefox

VERSION=$(python3 -c "import json; print(json.load(open('manifest.firefox.json'))['version'])")
echo ""
echo "------------------------------------------------------------"
echo "publishing version $VERSION to AMO (channel=$CHANNEL)"
echo "------------------------------------------------------------"

# web-ext sign uses the REST API end to end: it uploads the source,
# polls until AMO returns a validation result, then downloads the
# signed XPI. The whole thing is one HTTP exchange wearing a shell.
npx --yes web-ext sign \
  --source-dir="$ROOT/dist/firefox" \
  --artifacts-dir="$ROOT/dist/web-ext-artifacts" \
  --api-key="$AMO_JWT_ISSUER" \
  --api-secret="$AMO_JWT_SECRET" \
  --channel="$CHANNEL" \
  --no-config-discovery

echo ""
echo "signed XPI in $ROOT/dist/web-ext-artifacts/"
ls -la "$ROOT/dist/web-ext-artifacts/" 2>/dev/null | tail -5 || true
