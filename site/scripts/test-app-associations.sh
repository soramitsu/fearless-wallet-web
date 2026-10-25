#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY_SCRIPT="$ROOT_DIR/scripts/verify-app-associations.mjs"
FETCH_MOCK="$ROOT_DIR/scripts/test-app-associations-fetch-mock.mjs"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/fearless-site-associations.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/src/public/.well-known"
cp "$ROOT_DIR"/src/public/.well-known/assetlinks.json "$TMP_ROOT/src/public/.well-known/assetlinks.json"
cp "$ROOT_DIR"/src/public/.well-known/apple-app-site-association "$TMP_ROOT/src/public/.well-known/apple-app-site-association"
cp "$ROOT_DIR"/src/public/.well-known/apple-app-site-association.json "$TMP_ROOT/src/public/.well-known/apple-app-site-association.json"

node "$VERIFY_SCRIPT" --root "$TMP_ROOT" >/dev/null

expect_failure() {
  local label="$1"
  local expected="$2"
  local fixture="$3"
  local output

  if output="$(node "$VERIFY_SCRIPT" --root "$fixture" 2>&1)"; then
    printf 'Expected failure for %s\n' "$label" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf 'Unexpected failure for %s: %s\n' "$label" "$output" >&2
    exit 1
  fi
}

expect_live_failure() {
  local label="$1"
  local expected="$2"
  local fixture="$3"
  local output
  shift 3

  if output="$(env \
    APP_ASSOCIATION_FETCH_FIXTURE_ROOT="$fixture" \
    "$@" \
    node --import "$FETCH_MOCK" "$VERIFY_SCRIPT" \
      --root "$TMP_ROOT" \
      --live-base-url https://association-fixture.invalid 2>&1)"; then
    printf 'Expected live failure for %s\n' "$label" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf 'Unexpected live failure for %s: %s\n' "$label" "$output" >&2
    exit 1
  fi
}

make_fixture() {
  local name="$1"
  local fixture="$TMP_ROOT/$name"

  mkdir -p "$fixture/src/public/.well-known"
  cp "$TMP_ROOT/src/public/.well-known/assetlinks.json" "$fixture/src/public/.well-known/assetlinks.json"
  cp "$TMP_ROOT/src/public/.well-known/apple-app-site-association" "$fixture/src/public/.well-known/apple-app-site-association"
  cp "$TMP_ROOT/src/public/.well-known/apple-app-site-association.json" "$fixture/src/public/.well-known/apple-app-site-association.json"
  printf '%s\n' "$fixture"
}

fixture="$(make_fixture missing-login-relation)"
perl -0pi -e 's/,\n      "delegate_permission\/common\.get_login_creds"//' "$fixture/src/public/.well-known/assetlinks.json"
expect_failure 'missing Android credential relation' 'Android relations mismatch' "$fixture"

fixture="$(make_fixture wrong-android-package)"
perl -0pi -e 's/jp\.co\.soramitsu\.fearless/jp.co.soramitsu.attacker/' "$fixture/src/public/.well-known/assetlinks.json"
expect_failure 'wrong Android package' 'Android package mismatch' "$fixture"

fixture="$(make_fixture wrong-signing-fingerprint)"
perl -0pi -e 's/CC:17/AA:17/' "$fixture/src/public/.well-known/assetlinks.json"
expect_failure 'wrong Android fingerprint' 'release signing fingerprint mismatch' "$fixture"

fixture="$(make_fixture malformed-signing-fingerprint)"
perl -0pi -e 's/CC:17:CB/cc17cb/' "$fixture/src/public/.well-known/assetlinks.json"
expect_failure 'malformed Android fingerprint' 'malformed SHA-256 certificate fingerprint' "$fixture"

fixture="$(make_fixture stale-ios-app-id)"
perl -0pi -e 's/jp\.co\.soramitsu\.fearlesswallet\.dev/jp.co.soramitsu.fearlesswallet/' "$fixture/src/public/.well-known/apple-app-site-association"
expect_failure 'stale iOS app id' 'applinks application identifiers mismatch' "$fixture"

fixture="$(make_fixture retired-production-ios-app-id)"
node - "$fixture/src/public/.well-known/apple-app-site-association" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.applinks.details[0].appID = 'YLWWUD25VZ.jp.co.soramitsu.fearless';
value.webcredentials.apps[0] = 'YLWWUD25VZ.jp.co.soramitsu.fearless';
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'retired production iOS application identifier' 'applinks application identifiers mismatch' "$fixture"

fixture="$(make_fixture missing-webcredentials)"
node - "$fixture/src/public/.well-known/apple-app-site-association" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
delete value.webcredentials;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'missing iOS webcredentials' 'fields mismatch; expected applinks, webcredentials' "$fixture"

fixture="$(make_fixture broadened-json-applink)"
perl -0pi -e 's/"\/ton-connect"/"*"/' "$fixture/src/public/.well-known/apple-app-site-association.json"
expect_failure 'altered iOS applink component' '/ton-connect applink component is required' "$fixture"

fixture="$(make_fixture additional-json-applink)"
node - "$fixture/src/public/.well-known/apple-app-site-association.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.applinks.details[0].components.push({ '/': '*' });
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'additional broad iOS applink component' 'applink components mismatch' "$fixture"

fixture="$(make_fixture mixed-ios-id-fields)"
node - "$fixture/src/public/.well-known/apple-app-site-association" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.applinks.details[0].appIDs = [value.applinks.details[0].appID];
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'ambiguous iOS app identifier fields' 'fields mismatch; expected appID, paths' "$fixture"

fixture="$(make_fixture extra-android-target-field)"
node - "$fixture/src/public/.well-known/assetlinks.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value[0].target.site = 'https://attacker.invalid';
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'unexpected Android target field' 'target: fields mismatch' "$fixture"

fixture="$(make_fixture extra-aasa-root-field)"
node - "$fixture/src/public/.well-known/apple-app-site-association" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.activitycontinuation = { apps: ['YLWWUD25VZ.jp.co.soramitsu.attacker'] };
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure 'unexpected Apple association root field' 'fields mismatch' "$fixture"

fixture="$(make_fixture noncanonical-ios-id)"
perl -0pi -e 's/YLWWUD25VZ\.jp\.co\.soramitsu\.fearlesswallet"/ YLWWUD25VZ.jp.co.soramitsu.fearlesswallet"/' \
  "$fixture/src/public/.well-known/apple-app-site-association"
expect_failure 'noncanonical Apple application identifier' 'must be a non-empty canonical string' "$fixture"

fixture="$(make_fixture symlinked-source)"
ln -sf "$fixture/src/public/.well-known/apple-app-site-association" \
  "$fixture/src/public/.well-known/assetlinks.json"
expect_failure 'symlinked association source' 'association source must be a regular file' "$fixture"

fixture="$(make_fixture oversized-association-source)"
node - "$fixture/src/public/.well-known/assetlinks.json" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], ' '.repeat(65537));
NODE
expect_failure 'oversized association source' 'source exceeds 65536 bytes' "$fixture"

APP_ASSOCIATION_FETCH_FIXTURE_ROOT="$TMP_ROOT" \
  node --import "$FETCH_MOCK" "$VERIFY_SCRIPT" \
    --root "$TMP_ROOT" \
    --live-base-url https://association-fixture.invalid >/dev/null

expect_live_failure \
  'non-200 response' \
  'expected HTTP 200, received 503' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_STATUS=503

expect_live_failure \
  'wrong live content type' \
  'expected JSON content-type' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_CONTENT_TYPE=text/html

expect_live_failure \
  'missing live no-sniff header' \
  'X-Content-Type-Options must be nosniff' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_NOSNIFF=missing

expect_live_failure \
  'malformed live content length' \
  'malformed Content-Length header' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_CONTENT_LENGTH=+1

expect_live_failure \
  'oversized live content length' \
  'response exceeds 65536 bytes' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_CONTENT_LENGTH=65537

fixture="$(make_fixture oversized-live-body)"
node - "$fixture/src/public/.well-known/assetlinks.json" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], ' '.repeat(65537));
NODE
expect_live_failure \
  'oversized streamed live body' \
  'response exceeds 65536 bytes' \
  "$fixture" \
  APP_ASSOCIATION_FETCH_CONTENT_LENGTH=omit

fixture="$(make_fixture stale-live-source)"
perl -0pi -e 's/The universal link works only/The live file claims/' \
  "$fixture/src/public/.well-known/apple-app-site-association.json"
expect_live_failure \
  'valid but stale live association' \
  'deployed JSON does not match the source contract' \
  "$fixture"
expect_live_failure \
  'stale live association reports header drift too' \
  'X-Content-Type-Options must be nosniff' \
  "$fixture" \
  APP_ASSOCIATION_FETCH_NOSNIFF=missing
expect_live_failure \
  'bad headers do not hide stale live content' \
  'deployed JSON does not match the source contract' \
  "$fixture" \
  APP_ASSOCIATION_FETCH_NOSNIFF=missing

expect_live_failure \
  'invalid live JSON' \
  'invalid JSON' \
  "$TMP_ROOT" \
  APP_ASSOCIATION_FETCH_BODY='{'

if node "$VERIFY_SCRIPT" --root "$TMP_ROOT" --live-base-url 'http://association-fixture.invalid' >/dev/null 2>&1; then
  printf 'Expected insecure live base URL to fail\n' >&2
  exit 1
fi
if node "$VERIFY_SCRIPT" --root "$TMP_ROOT" --live-base-url 'https://user:secret@association-fixture.invalid' >/dev/null 2>&1; then
  printf 'Expected credential-bearing live base URL to fail\n' >&2
  exit 1
fi
if node "$VERIFY_SCRIPT" --root "$TMP_ROOT" --live-base-url 'https://association-fixture.invalid/subpath' >/dev/null 2>&1; then
  printf 'Expected path-bearing live base URL to fail\n' >&2
  exit 1
fi
if node "$VERIFY_SCRIPT" --root "$TMP_ROOT" --live-base-url 'https://association-fixture.invalid/?environment=preview' >/dev/null 2>&1; then
  printf 'Expected query-bearing live base URL to fail\n' >&2
  exit 1
fi
if node "$VERIFY_SCRIPT" --root "$TMP_ROOT" --live-base-url 'https://association-fixture.invalid/#preview' >/dev/null 2>&1; then
  printf 'Expected fragment-bearing live base URL to fail\n' >&2
  exit 1
fi

printf 'App association adversarial tests passed.\n'
