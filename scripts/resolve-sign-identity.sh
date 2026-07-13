#!/usr/bin/env bash
# Pick a Polarity Lab Developer ID Application identity for Cosmos.app signing.
set -euo pipefail

IDENTITY_PATTERN='^Developer ID Application: Polarity Lab( LLC)? \([A-Z0-9]{10}\)$'

validate_identity() {
  local identity="$1"
  if [[ ! "$identity" =~ $IDENTITY_PATTERN ]]; then
    echo "resolve-sign-identity: refusing non-Polarity Developer ID identity" >&2
    echo "  expected: Developer ID Application: Polarity Lab LLC (<team id>)" >&2
    return 1
  fi

  if [[ -n "${POLARITY_TEAM_ID:-}" ]]; then
    if [[ ! "$POLARITY_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
      echo "resolve-sign-identity: POLARITY_TEAM_ID must be a 10-character Apple team id" >&2
      return 1
    fi
    local identity_team="${identity##*(}"
    identity_team="${identity_team%)}"
    if [[ "$identity_team" != "$POLARITY_TEAM_ID" ]]; then
      echo "resolve-sign-identity: selected certificate does not match POLARITY_TEAM_ID" >&2
      echo "  certificate team: $identity_team" >&2
      echo "  expected team: $POLARITY_TEAM_ID" >&2
      return 1
    fi
  fi
}

if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  validate_identity "$SIGN_IDENTITY"
  echo "$SIGN_IDENTITY"
  exit 0
fi

pick_from_keychain() {
  security find-identity -v -p codesigning 2>/dev/null \
    | awk -F'"' -v pattern="$1" '$2 ~ pattern && !found { print $2; found = 1 }'
}

identity="$(pick_from_keychain '^Developer ID Application: Polarity Lab LLC [(][A-Z0-9]+[)]$')"
if [[ -z "$identity" ]]; then
  identity="$(pick_from_keychain '^Developer ID Application: Polarity Lab [(][A-Z0-9]+[)]$')"
fi
if [[ -n "$identity" ]]; then
  validate_identity "$identity"
  echo "$identity"
  exit 0
fi

echo "resolve-sign-identity: no Polarity Lab Developer ID Application certificate in the keychain" >&2
echo "  mint one at developer.apple.com → Certificates → Developer ID Application" >&2
echo "  required: Developer ID Application: Polarity Lab LLC (<team id>)" >&2
exit 1
