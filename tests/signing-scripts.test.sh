#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESOLVER="$ROOT/scripts/resolve-sign-identity.sh"
BUILD_SCRIPT="$ROOT/scripts/build-daemon-app.sh"
DEV_BUILD_SCRIPT="$ROOT/scripts/build-daemon-app-dev.sh"
WORKFLOW="$ROOT/.github/workflows/build-daemon-app.yml"
PACKAGE_JSON="$ROOT/package.json"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bin"
cat > "$TMP_DIR/bin/security" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${MOCK_SECURITY_OUTPUT:-}"
EOF
chmod +x "$TMP_DIR/bin/security"

tests=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  tests=$((tests + 1))
  printf 'ok %d - %s\n' "$tests" "$1"
}

run_resolver() {
  PATH="$TMP_DIR/bin:$PATH" bash "$RESOLVER"
}

org_identity='Developer ID Application: Polarity Lab LLC (AB12CD34EF)'
legacy_org_identity='Developer ID Application: Polarity Lab (ZY98XW76VU)'
personal_identity='Developer ID Application: Theodore Addo (SA5F7PACJE)'

output="$(
  MOCK_SECURITY_OUTPUT="  1) ABC \"$personal_identity\"
  2) DEF \"$org_identity\"" \
    run_resolver
)"
[[ "$output" == "$org_identity" ]] || fail "resolver did not select the LLC identity"
pass "selects the Polarity Lab LLC identity and skips personal identities"

output="$(SIGN_IDENTITY="$legacy_org_identity" run_resolver)"
[[ "$output" == "$legacy_org_identity" ]] || fail "explicit Polarity Lab identity was not accepted"
pass "accepts an explicit Polarity Lab identity"

stdout="$TMP_DIR/personal.stdout"
stderr="$TMP_DIR/personal.stderr"
if SIGN_IDENTITY="$personal_identity" run_resolver >"$stdout" 2>"$stderr"; then
  fail "explicit personal identity was accepted"
fi
[[ ! -s "$stdout" ]] || fail "rejected personal identity leaked to stdout"
grep -q 'Polarity Lab' "$stderr" || fail "personal identity rejection was not clear"
pass "rejects an explicit personal Developer ID identity"

stdout="$TMP_DIR/fallback.stdout"
stderr="$TMP_DIR/fallback.stderr"
if MOCK_SECURITY_OUTPUT="  1) ABC \"$personal_identity\"" \
  run_resolver >"$stdout" 2>"$stderr"; then
  fail "personal keychain identity was used as fallback"
fi
[[ ! -s "$stdout" ]] || fail "personal fallback identity leaked to stdout"
grep -q 'Polarity Lab' "$stderr" || fail "missing-org-certificate error was not clear"
pass "never falls back to a personal Developer ID identity"

stderr="$TMP_DIR/team.stderr"
if SIGN_IDENTITY="$org_identity" POLARITY_TEAM_ID='ZZ99YY88XX' \
  run_resolver >"$TMP_DIR/team.stdout" 2>"$stderr"; then
  fail "mismatched Polarity team id was accepted"
fi
grep -q 'POLARITY_TEAM_ID' "$stderr" || fail "team id mismatch did not name POLARITY_TEAM_ID"
pass "rejects an identity from the wrong expected team"

SIGN_IDENTITY="$org_identity" POLARITY_TEAM_ID='AB12CD34EF' \
  run_resolver >"$TMP_DIR/team-match.stdout"
[[ "$(<"$TMP_DIR/team-match.stdout")" == "$org_identity" ]] || fail "matching team id was rejected"
pass "accepts an identity from the expected Polarity team"

grep -Fq '/Users/shadrack/projects/cosmos/.secrets/apple/AuthKey_CHA2KDX6C4.p8' "$BUILD_SCRIPT" \
  || fail "build script does not default to the org notary key path"
grep -Fq 'NOTARY_KEY_ID:-CHA2KDX6C4' "$BUILD_SCRIPT" \
  || fail "build script does not default to the org notary key id"
if grep -Eq 'NOTARY_ISSUER_ID:-[0-9a-fA-F-]{20,}' "$BUILD_SCRIPT"; then
  fail "build script still contains a default notary issuer"
fi
grep -Fq 'NOTARY_ISSUER_ID is required' "$BUILD_SCRIPT" \
  || fail "build script does not require NOTARY_ISSUER_ID"
pass "uses org notary key defaults without a stale issuer default"

stapler_line="$(grep -n 'xcrun stapler validate' "$BUILD_SCRIPT" | tail -1 | cut -d: -f1)"
gatekeeper_line="$(grep -n '^spctl --assess' "$BUILD_SCRIPT" | tail -1 | cut -d: -f1)"
if [[ -z "$stapler_line" || -z "$gatekeeper_line" || "$gatekeeper_line" -le "$stapler_line" ]]; then
  fail "build script does not enforce Gatekeeper assessment after stapling"
fi
pass "enforces Gatekeeper assessment on the notarized app"

staple_line="$(grep -n 'xcrun stapler staple' "$BUILD_SCRIPT" | tail -1 | cut -d: -f1)"
final_archive_line="$(grep -n 'ditto -c -k --keepParent' "$BUILD_SCRIPT" | tail -1 | cut -d: -f1)"
if [[ -z "$staple_line" || -z "$final_archive_line" || "$final_archive_line" -le "$staple_line" ]]; then
  fail "build script does not package the app again after stapling"
fi
pass "packages the stapled app for distribution"

if grep -Fq 'DEV_SIGN="${SIGN_IDENTITY:-}"' "$DEV_BUILD_SCRIPT"; then
  fail "development build bypasses the org identity resolver"
fi
grep -Fq 'resolve-sign-identity.sh' "$DEV_BUILD_SCRIPT" \
  || fail "development build does not use the org identity resolver"
pass "keeps development builds from bypassing org identity validation"

grep -Fq '"test:signing": "bash tests/signing-scripts.test.sh"' "$PACKAGE_JSON" \
  || fail "package scripts do not expose the signing regression suite"
grep -Fq 'run: npm run test:signing' "$WORKFLOW" \
  || fail "release workflow does not run the signing regression suite"
pass "runs signing regressions from package scripts and the release workflow"

grep -Fq 'path: dist/Cosmos.zip' "$WORKFLOW" \
  || fail "workflow does not upload the notarized Cosmos.zip archive"
if grep -Eq 'path: dist/Cosmos(Sync)?\.app' "$WORKFLOW"; then
  fail "workflow uploads an app directory and will lose executable permissions"
fi
pass "uploads the notarized archive without flattening app permissions"

printf '1..%d\n' "$tests"
