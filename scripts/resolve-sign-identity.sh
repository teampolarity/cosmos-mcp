#!/usr/bin/env bash
# Pick a Developer ID Application identity for Cosmos Sync.app signing.
# Prefers Polarity Lab; honors SIGN_IDENTITY when set explicitly.
set -euo pipefail

if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  echo "$SIGN_IDENTITY"
  exit 0
fi

pick_from_keychain() {
  security find-identity -v -p codesigning 2>/dev/null \
    | awk -F'"' -v pattern="$1" '$2 ~ pattern { print $2; exit }'
}

identity="$(pick_from_keychain 'Developer ID Application: Polarity Lab')"
if [[ -n "$identity" ]]; then
  echo "$identity"
  exit 0
fi

identity="$(pick_from_keychain 'Developer ID Application')"
if [[ -n "$identity" ]]; then
  echo "$identity" >&2
  echo "$identity"
  exit 0
fi

echo "resolve-sign-identity: no Developer ID Application cert in login keychain" >&2
echo "  mint one at developer.apple.com → Certificates → Developer ID Application" >&2
echo "  prefer: Developer ID Application: Polarity Lab (<team id>)" >&2
exit 1
