#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-bitcoin-broadcast-evidence.sh"
negative_count=0

fail() {
  echo "[bitcoin-broadcast-evidence-test][error] $*" >&2
  exit 1
}

write_blocked_manifest() {
  local file="$1"
  cat >"$file" <<'JSON'
{
  "schemaVersion": 1,
  "scope": "web-bitcoin-testnet-broadcast-readiness",
  "status": "blocked",
  "releaseEnabled": false,
  "lastReviewed": "2026-06-26",
  "blockers": [
    "funded-testnet-broadcast-evidence-missing"
  ],
  "smokeCommand": "yarn test:smoke:bitcoin",
  "readyVerificationCommands": [
    "yarn test:bitcoin-broadcast-evidence-template",
    "yarn generate:bitcoin-broadcast-evidence-template -- --output build/reports/bitcoin-broadcast-evidence-template.json",
    "yarn test:bitcoin-broadcast-evidence-audit",
    "yarn audit:bitcoin-broadcast-evidence --require-ready",
    "FEARLESS_BITCOIN_TESTNET_LIVE=1 yarn test:smoke:bitcoin"
  ],
  "liveSmokeEnvironment": [
    "FEARLESS_BITCOIN_TESTNET_LIVE",
    "FEARLESS_BITCOIN_TESTNET_MNEMONIC",
    "FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS",
    "FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS",
    "FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT",
    "FEARLESS_BITCOIN_TESTNET_OUTPOINT"
  ],
  "defaultIndexerUrl": "https://blockstream.info/testnet/api",
  "requiredEvidenceFields": [
    "txid",
    "sourceAddress",
    "recipientAddress",
    "amountSat",
    "outpoint",
    "indexerUrl",
    "timestamp",
    "operator",
    "commit"
  ],
  "evidence": []
}
JSON
}

write_ready_manifest() {
  local file="$1"
  cat >"$file" <<'JSON'
{
  "schemaVersion": 1,
  "scope": "web-bitcoin-testnet-broadcast-readiness",
  "status": "ready",
  "releaseEnabled": true,
  "lastReviewed": "2026-06-26",
  "blockers": [],
  "smokeCommand": "yarn test:smoke:bitcoin",
  "readyVerificationCommands": [
    "yarn test:bitcoin-broadcast-evidence-template",
    "yarn generate:bitcoin-broadcast-evidence-template -- --output build/reports/bitcoin-broadcast-evidence-template.json",
    "yarn test:bitcoin-broadcast-evidence-audit",
    "yarn audit:bitcoin-broadcast-evidence --require-ready",
    "FEARLESS_BITCOIN_TESTNET_LIVE=1 yarn test:smoke:bitcoin"
  ],
  "liveSmokeEnvironment": [
    "FEARLESS_BITCOIN_TESTNET_LIVE",
    "FEARLESS_BITCOIN_TESTNET_MNEMONIC",
    "FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS",
    "FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS",
    "FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT",
    "FEARLESS_BITCOIN_TESTNET_OUTPOINT"
  ],
  "defaultIndexerUrl": "https://blockstream.info/testnet/api",
  "requiredEvidenceFields": [
    "txid",
    "sourceAddress",
    "recipientAddress",
    "amountSat",
    "outpoint",
    "indexerUrl",
    "timestamp",
    "operator",
    "commit"
  ],
  "evidence": [
    {
      "txid": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "sourceAddress": "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
      "recipientAddress": "tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f",
      "amountSat": "1000",
      "outpoint": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210:0",
      "indexerUrl": "https://blockstream.info/testnet/api",
      "timestamp": "2026-06-26T00:00:00Z",
      "operator": "release",
      "commit": "89abcdef89abcdef89abcdef89abcdef89abcdef"
    }
  ]
}
JSON
}

write_indexer_fixture() {
  local file="$1"
  cat >"$file" <<'JSON'
{
  "status": 200,
  "contentType": "application/json",
  "effectiveUrl": "https://blockstream.info/testnet/api/tx/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "redirectCount": 0,
  "body": {
    "txid": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "vin": [
      {
        "txid": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        "vout": 0,
        "prevout": {
          "scriptpubkey_address": "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
          "value": 2000
        }
      }
    ],
    "vout": [
      {
        "scriptpubkey_address": "tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f",
        "value": 1000
      }
    ],
    "status": {
      "confirmed": true,
      "block_time": 1782345600
    }
  }
}
JSON
}

run_audit() {
  local manifest="$1"
  shift
  /bin/bash "$AUDIT_SCRIPT" \
    --selftest-fixture-root "$tmp_dir" \
    --selftest-indexer-response "$indexer_fixture" \
    --evidence "$manifest" \
    "$@"
}

expect_failure() {
  local name="$1"
  local expected="$2"
  shift 2
  local output
  negative_count=$((negative_count + 1))

  set +e
  output="$("$@" 2>&1)"
  local status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo "$output" >&2
    fail "$name unexpectedly passed"
  fi

  if [[ "$output" != *"$expected"* ]]; then
    echo "$output" >&2
    fail "$name did not report expected text: $expected"
  fi
}

expect_success() {
  local name="$1"
  shift
  local output

  set +e
  output="$("$@" 2>&1)"
  local status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    echo "$output" >&2
    fail "$name unexpectedly failed"
  fi
}

write_indexer_url_variant() {
  local source="$1"
  local destination="$2"
  local url="$3"
  cp "$source" "$destination"
  node - "$destination" "$url" <<'NODE'
const fs = require('fs');
const [file, url] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].indexerUrl = url;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

write_response_field_variant() {
  local source="$1"
  local destination="$2"
  local field="$3"
  local json_value="$4"
  cp "$source" "$destination"
  node - "$destination" "$field" "$json_value" <<'NODE'
const fs = require('fs');
const [file, field, jsonValue] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response[field] = JSON.parse(jsonValue);
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
}

assert_audit_source_contract() {
  local source
  source="$(<"$AUDIT_SCRIPT")"
  local marker
  for marker in \
    "const CURL_BIN = '/usr/bin/curl';" \
    "const GIT_BIN = '/usr/bin/git';" \
    "/usr/bin/env -i" \
    '"$NODE_BIN" -' \
    "execFileSync(CURL_BIN, [" \
    "execFileSync(GIT_BIN," \
    "'--disable'," \
    "'--proto', '=https'," \
    "'--max-redirs', '0'," \
    "'--max-filesize', String(MAX_RESPONSE_BODY_BYTES)," \
    "'--noproxy', '*'," \
    "'--proxy', ''," \
    "env: sealedToolEnvironment(homeDir)" \
    "env: sealedToolEnvironment('/')" \
    "PATH: '/usr/bin:/bin'" \
    "CURL_HOME: homeDir" \
    "GIT_CONFIG_NOSYSTEM: '1'" \
    "GIT_CONFIG_GLOBAL: '/dev/null'" \
    "contentType !== 'application/json'" \
    "effectiveUrl !== requestUrl"; do
    [[ "$source" == *"$marker"* ]] || fail "production transport contract marker missing: $marker"
  done
  [[ "$source" != *"execFileSync('curl'"* ]] || fail "production transport must not resolve curl through PATH"
  [[ "$source" != *"execFileSync('git'"* ]] || fail "production commit verifier must not resolve git through PATH"
  local curl_invocation="${source#*"execFileSync(CURL_BIN, ["}"
  [[ "$curl_invocation" == *"'--disable',"* ]] || fail "curl invocation is missing --disable"
  [[ "${curl_invocation%%"'--disable',"*}" != *"'--"* ]] || fail "--disable must be the first curl option"
}

tmp_dir="$(cd -P "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$tmp_dir"' EXIT

blocked="$tmp_dir/blocked.json"
ready="$tmp_dir/ready.json"
indexer_fixture="$tmp_dir/indexer-fixture.json"
write_blocked_manifest "$blocked"
write_ready_manifest "$ready"
write_indexer_fixture "$indexer_fixture"
printf '%s\n' '89abcdef89abcdef89abcdef89abcdef89abcdef' >"$tmp_dir/current-commit.txt"
printf '%s\n' '2026-06-26T00:05:00Z' >"$tmp_dir/current-time.txt"

assert_audit_source_contract

run_audit "$blocked" >/dev/null
selftest_ready_output="$(run_audit "$ready" --require-ready)"
[[ "$selftest_ready_output" == *"mode=selftest-not-release-evidence"* ]] || fail "self-test success must be visibly marked as non-production evidence"

expect_failure "missing Bitcoin broadcast evidence manifest" "Bitcoin broadcast evidence manifest missing" run_audit "$tmp_dir/missing.json"

bad_json="$tmp_dir/bad-json.json"
printf '{' >"$bad_json"
expect_failure "invalid Bitcoin broadcast evidence JSON" "must be valid JSON" run_audit "$bad_json"

bad_schema="$tmp_dir/bad-schema.json"
cp "$blocked" "$bad_schema"
perl -0pi -e 's/"schemaVersion": 1/"schemaVersion": 2/' "$bad_schema"
expect_failure "bad schema" "schemaVersion must be 1" run_audit "$bad_schema"

missing_last_reviewed="$tmp_dir/missing-last-reviewed.json"
cp "$blocked" "$missing_last_reviewed"
perl -0pi -e 's/\n  "lastReviewed": "2026-06-26",//' "$missing_last_reviewed"
expect_failure "missing Bitcoin broadcast review date" "lastReviewed must be a YYYY-MM-DD UTC review date" run_audit "$missing_last_reviewed"

bad_last_reviewed="$tmp_dir/bad-last-reviewed.json"
cp "$blocked" "$bad_last_reviewed"
perl -0pi -e 's/"lastReviewed": "2026-06-26"/"lastReviewed": "TODO_YYYY_MM_DD"/' "$bad_last_reviewed"
expect_failure "bad Bitcoin broadcast review date" "lastReviewed must be a YYYY-MM-DD UTC review date" run_audit "$bad_last_reviewed"

future_last_reviewed="$tmp_dir/future-last-reviewed.json"
cp "$blocked" "$future_last_reviewed"
perl -0pi -e 's/"lastReviewed": "2026-06-26"/"lastReviewed": "2999-01-01"/' "$future_last_reviewed"
expect_failure "future Bitcoin broadcast review date" "lastReviewed must not be in the future" run_audit "$future_last_reviewed"

release_enabled_blocked="$tmp_dir/release-enabled-blocked.json"
cp "$blocked" "$release_enabled_blocked"
perl -0pi -e 's/"releaseEnabled": false/"releaseEnabled": true/' "$release_enabled_blocked"
expect_failure "release enabled while blocked" "releaseEnabled must remain false while Bitcoin broadcast evidence is blocked" run_audit "$release_enabled_blocked"

missing_blocker="$tmp_dir/missing-blocker.json"
cp "$blocked" "$missing_blocker"
perl -0pi -e 's/"funded-testnet-broadcast-evidence-missing"//' "$missing_blocker"
expect_failure "blocked evidence missing funded broadcast blocker" "blocked evidence missing blocker funded-testnet-broadcast-evidence-missing" run_audit "$missing_blocker"

blocked_with_evidence="$tmp_dir/blocked-with-evidence.json"
node - "$blocked" "$ready" "$blocked_with_evidence" <<'NODE'
const fs = require('fs');
const [blockedFile, readyFile, outputFile] = process.argv.slice(2);
const blockedManifest = JSON.parse(fs.readFileSync(blockedFile, 'utf8'));
const readyManifest = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
blockedManifest.evidence = readyManifest.evidence;
fs.writeFileSync(outputFile, `${JSON.stringify(blockedManifest, null, 2)}\n`);
NODE
expect_failure "blocked evidence contains funded broadcast record" "blocked Bitcoin broadcast evidence must not contain evidence records" run_audit "$blocked_with_evidence"

unsupported_blocker="$tmp_dir/unsupported-blocker.json"
cp "$blocked" "$unsupported_blocker"
node - "$unsupported_blocker" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.blockers.push('manual-approval-pending');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported Bitcoin broadcast evidence blocker" "unsupported Bitcoin broadcast evidence blocker: manual-approval-pending" run_audit "$unsupported_blocker"

duplicate_blocker="$tmp_dir/duplicate-blocker.json"
cp "$blocked" "$duplicate_blocker"
node - "$duplicate_blocker" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.blockers.push('funded-testnet-broadcast-evidence-missing');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "duplicate Bitcoin broadcast evidence blocker" "duplicate Bitcoin broadcast evidence blocker" run_audit "$duplicate_blocker"

missing_env="$tmp_dir/missing-env.json"
cp "$blocked" "$missing_env"
perl -0pi -e 's/,\n    "FEARLESS_BITCOIN_TESTNET_OUTPOINT"//' "$missing_env"
expect_failure "missing live smoke env contract" "liveSmokeEnvironment missing FEARLESS_BITCOIN_TESTNET_OUTPOINT" run_audit "$missing_env"

missing_ready_command="$tmp_dir/missing-ready-command.json"
cp "$blocked" "$missing_ready_command"
perl -0pi -e 's/yarn audit:bitcoin-broadcast-evidence --require-ready/yarn audit:bitcoin-broadcast-evidence/' "$missing_ready_command"
expect_failure "missing require-ready command" "readyVerificationCommands missing yarn audit:bitcoin-broadcast-evidence --require-ready" run_audit "$missing_ready_command"

missing_template_test_command="$tmp_dir/missing-template-test-command.json"
cp "$blocked" "$missing_template_test_command"
perl -0pi -e 's/"yarn test:bitcoin-broadcast-evidence-template",\n//' "$missing_template_test_command"
expect_failure "missing template self-test command" "readyVerificationCommands missing yarn test:bitcoin-broadcast-evidence-template" run_audit "$missing_template_test_command"

missing_template_generator_command="$tmp_dir/missing-template-generator-command.json"
cp "$blocked" "$missing_template_generator_command"
perl -0pi -e 's/"yarn generate:bitcoin-broadcast-evidence-template -- --output build\/reports\/bitcoin-broadcast-evidence-template.json",\n//' "$missing_template_generator_command"
expect_failure "missing template generator command" "readyVerificationCommands missing yarn generate:bitcoin-broadcast-evidence-template -- --output build/reports/bitcoin-broadcast-evidence-template.json" run_audit "$missing_template_generator_command"

duplicate_ready_command="$tmp_dir/duplicate-ready-command.json"
cp "$blocked" "$duplicate_ready_command"
node - "$duplicate_ready_command" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.readyVerificationCommands.push('yarn test:bitcoin-broadcast-evidence-audit');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "duplicate Bitcoin broadcast evidence verification command" "duplicate Bitcoin broadcast evidence verification command" run_audit "$duplicate_ready_command"

missing_required_field="$tmp_dir/missing-required-field.json"
cp "$blocked" "$missing_required_field"
perl -0pi -e 's/"txid",\n//' "$missing_required_field"
expect_failure "missing txid evidence field" "requiredEvidenceFields missing txid" run_audit "$missing_required_field"

duplicate_required_field="$tmp_dir/duplicate-required-field.json"
cp "$blocked" "$duplicate_required_field"
node - "$duplicate_required_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.requiredEvidenceFields.push('txid');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "duplicate Bitcoin broadcast evidence required field" "duplicate Bitcoin broadcast evidence required field" run_audit "$duplicate_required_field"

unsupported_required_field="$tmp_dir/unsupported-required-field.json"
cp "$blocked" "$unsupported_required_field"
node - "$unsupported_required_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.requiredEvidenceFields.push('network');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported required Bitcoin broadcast evidence field" "unsupported Bitcoin broadcast evidence field in manifest: network" run_audit "$unsupported_required_field"

ready_no_evidence="$tmp_dir/ready-no-evidence.json"
cp "$ready" "$ready_no_evidence"
perl -0pi -e 's/"evidence": \[[\s\S]*?\n  \]/"evidence": []/' "$ready_no_evidence"
expect_failure "ready evidence without funded broadcast" "ready Bitcoin broadcast evidence requires at least one indexer-verified funded testnet broadcast record" run_audit "$ready_no_evidence" --require-ready

ready_with_blocker="$tmp_dir/ready-with-blocker.json"
cp "$ready" "$ready_with_blocker"
perl -0pi -e 's/"blockers": \[\]/"blockers": ["funded-testnet-broadcast-evidence-missing"]/' "$ready_with_blocker"
expect_failure "ready evidence carries blockers" "blockers must be empty when Bitcoin broadcast evidence is ready" run_audit "$ready_with_blocker" --require-ready

ready_bad_txid="$tmp_dir/ready-bad-txid.json"
cp "$ready" "$ready_bad_txid"
perl -0pi -e 's/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/1234/' "$ready_bad_txid"
expect_failure "ready evidence bad txid" "txid must be a 64-character transaction id" run_audit "$ready_bad_txid" --require-ready

ready_placeholder_txid="$tmp_dir/ready-placeholder-txid.json"
cp "$ready" "$ready_placeholder_txid"
perl -0pi -e 's/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/1111111111111111111111111111111111111111111111111111111111111111/' "$ready_placeholder_txid"
expect_failure "ready evidence placeholder txid" "txid must not be a placeholder transaction id" run_audit "$ready_placeholder_txid" --require-ready

ready_mainnet_address="$tmp_dir/ready-mainnet-address.json"
cp "$ready" "$ready_mainnet_address"
perl -0pi -e 's/tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl/bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4/' "$ready_mainnet_address"
expect_failure "ready evidence mainnet source address" "sourceAddress must be a Bitcoin testnet address" run_audit "$ready_mainnet_address" --require-ready

ready_bad_recipient="$tmp_dir/ready-bad-recipient.json"
cp "$ready" "$ready_bad_recipient"
perl -0pi -e 's/tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f/tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54q/' "$ready_bad_recipient"
expect_failure "ready evidence checksum-bad recipient address" "recipientAddress must be a Bitcoin testnet address" run_audit "$ready_bad_recipient" --require-ready

ready_same_addresses="$tmp_dir/ready-same-addresses.json"
cp "$ready" "$ready_same_addresses"
perl -0pi -e 's/tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f/tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl/' "$ready_same_addresses"
expect_failure "ready evidence same source and recipient" "sourceAddress and recipientAddress must be different" run_audit "$ready_same_addresses" --require-ready

ready_zero_amount="$tmp_dir/ready-zero-amount.json"
cp "$ready" "$ready_zero_amount"
perl -0pi -e 's/"amountSat": "1000"/"amountSat": "0"/' "$ready_zero_amount"
expect_failure "ready evidence zero amount" "amountSat must be a positive integer string" run_audit "$ready_zero_amount" --require-ready

ready_placeholder_operator="$tmp_dir/ready-placeholder-operator.json"
cp "$ready" "$ready_placeholder_operator"
perl -0pi -e 's/"operator": "release"/"operator": "TODO_OPERATOR"/' "$ready_placeholder_operator"
expect_failure "ready evidence placeholder operator" "operator must not be a placeholder operator" run_audit "$ready_placeholder_operator" --require-ready

ready_multiline_operator="$tmp_dir/ready-multiline-operator.json"
cp "$ready" "$ready_multiline_operator"
node - "$ready_multiline_operator" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].operator = 'release\noperator';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence multiline operator" "operator must be a single-line public value" run_audit "$ready_multiline_operator" --require-ready

ready_secret_operator="$tmp_dir/ready-secret-operator.json"
cp "$ready" "$ready_secret_operator"
node - "$ready_secret_operator" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].operator = 'ghp_1234567890abcdefghijklmnop';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence secret-like operator" "operator must not contain secret-like token" run_audit "$ready_secret_operator" --require-ready

ready_bad_outpoint="$tmp_dir/ready-bad-outpoint.json"
cp "$ready" "$ready_bad_outpoint"
perl -0pi -e 's/fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210:0/2222:0/' "$ready_bad_outpoint"
expect_failure "ready evidence bad outpoint" "outpoint must be formatted as <txid>:<vout>" run_audit "$ready_bad_outpoint" --require-ready

ready_placeholder_outpoint="$tmp_dir/ready-placeholder-outpoint.json"
cp "$ready" "$ready_placeholder_outpoint"
perl -0pi -e 's/fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210:0/2222222222222222222222222222222222222222222222222222222222222222:0/' "$ready_placeholder_outpoint"
expect_failure "ready evidence placeholder outpoint" "outpoint must not use a placeholder transaction id" run_audit "$ready_placeholder_outpoint" --require-ready

ready_http_indexer="$tmp_dir/ready-http-indexer.json"
cp "$ready" "$ready_http_indexer"
node - "$ready_http_indexer" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].indexerUrl = 'http://blockstream.info/testnet/api';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence http indexer" "indexerUrl must use https" run_audit "$ready_http_indexer" --require-ready

ready_bad_indexer="$tmp_dir/ready-bad-indexer.json"
cp "$ready" "$ready_bad_indexer"
node - "$ready_bad_indexer" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].indexerUrl = 'not-a-url';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence malformed indexer" "indexerUrl must be a valid URL" run_audit "$ready_bad_indexer" --require-ready

ready_unreviewed_indexer="$tmp_dir/ready-unreviewed-indexer.json"
cp "$ready" "$ready_unreviewed_indexer"
node - "$ready_unreviewed_indexer" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].indexerUrl = 'https://example.invalid/testnet/api';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence unreviewed indexer" "indexerUrl must be exactly the reviewed origin and path https://blockstream.info/testnet/api" run_audit "$ready_unreviewed_indexer" --require-ready

ready_duplicate_txid="$tmp_dir/ready-duplicate-txid.json"
cp "$ready" "$ready_duplicate_txid"
node - "$ready_duplicate_txid" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence.push({ ...manifest.evidence[0] });
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "ready evidence duplicate txid" "duplicate Bitcoin broadcast txid evidence" run_audit "$ready_duplicate_txid" --require-ready

ready_missing_indexer_tx="$tmp_dir/ready-missing-indexer-tx.json"
missing_indexer_fixture="$tmp_dir/missing-indexer-fixture.json"
cp "$ready" "$ready_missing_indexer_tx"
printf '{}\n' >"$missing_indexer_fixture"
indexer_fixture="$missing_indexer_fixture" expect_failure "ready evidence missing indexer tx" "indexer HTTP status must be exactly 200" run_audit "$ready_missing_indexer_tx" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_wrong_recipient_output="$tmp_dir/ready-wrong-recipient-output.json"
wrong_recipient_fixture="$tmp_dir/wrong-recipient-fixture.json"
cp "$ready" "$ready_wrong_recipient_output"
cp "$indexer_fixture" "$wrong_recipient_fixture"
node - "$wrong_recipient_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture.body.vout[0].value = 999;
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$wrong_recipient_fixture" expect_failure "ready evidence wrong recipient output" "indexer transaction missing recipient output" run_audit "$ready_wrong_recipient_output" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_missing_outpoint="$tmp_dir/ready-missing-outpoint.json"
missing_outpoint_fixture="$tmp_dir/missing-outpoint-fixture.json"
cp "$ready" "$ready_missing_outpoint"
cp "$indexer_fixture" "$missing_outpoint_fixture"
node - "$missing_outpoint_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture.body.vin[0].vout = 1;
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$missing_outpoint_fixture" expect_failure "ready evidence missing funding outpoint" "indexer transaction missing funding outpoint" run_audit "$ready_missing_outpoint" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_wrong_source="$tmp_dir/ready-wrong-source.json"
wrong_source_fixture="$tmp_dir/wrong-source-fixture.json"
cp "$ready" "$ready_wrong_source"
cp "$indexer_fixture" "$wrong_source_fixture"
node - "$wrong_source_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture.body.vin[0].prevout.scriptpubkey_address = 'tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f';
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$wrong_source_fixture" expect_failure "ready evidence wrong source address" "funding outpoint source address does not match evidence sourceAddress" run_audit "$ready_wrong_source" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_unconfirmed="$tmp_dir/ready-unconfirmed.json"
unconfirmed_fixture="$tmp_dir/unconfirmed-fixture.json"
cp "$ready" "$ready_unconfirmed"
cp "$indexer_fixture" "$unconfirmed_fixture"
node - "$unconfirmed_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture.body.status = { confirmed: false };
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$unconfirmed_fixture" expect_failure "ready evidence unconfirmed indexer tx" "indexer transaction must be confirmed before ready evidence is accepted" run_audit "$ready_unconfirmed" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_missing_block_time="$tmp_dir/ready-missing-block-time.json"
missing_block_time_fixture="$tmp_dir/missing-block-time-fixture.json"
cp "$ready" "$ready_missing_block_time"
cp "$indexer_fixture" "$missing_block_time_fixture"
node - "$missing_block_time_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
delete fixture.body.status.block_time;
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$missing_block_time_fixture" expect_failure "ready evidence missing block time" "confirmed indexer transaction must include a positive block_time" run_audit "$ready_missing_block_time" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_timestamp_before_block="$tmp_dir/ready-timestamp-before-block.json"
timestamp_before_block_fixture="$tmp_dir/timestamp-before-block-fixture.json"
cp "$ready" "$ready_timestamp_before_block"
cp "$indexer_fixture" "$timestamp_before_block_fixture"
node - "$timestamp_before_block_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture.body.status.block_time = 1782604800;
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$timestamp_before_block_fixture" expect_failure "ready evidence timestamp before block" "timestamp must be at or after the confirmed transaction block_time" run_audit "$ready_timestamp_before_block" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_stale_review_date="$tmp_dir/ready-stale-review-date.json"
cp "$ready" "$ready_stale_review_date"
perl -0pi -e 's/"lastReviewed": "2026-06-26"/"lastReviewed": "2026-06-25"/' "$ready_stale_review_date"
expect_failure "ready evidence stale review date" "lastReviewed must be on or after the latest evidence timestamp date" run_audit "$ready_stale_review_date" --require-ready

unsupported_top_level="$tmp_dir/unsupported-top-level.json"
cp "$ready" "$unsupported_top_level"
node - "$unsupported_top_level" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.network = 'testnet';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported top-level Bitcoin broadcast evidence field" "manifest.network is not supported in public Bitcoin broadcast evidence" run_audit "$unsupported_top_level" --require-ready

unsupported_record_field="$tmp_dir/unsupported-record-field.json"
cp "$ready" "$unsupported_record_field"
node - "$unsupported_record_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].network = 'testnet';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported Bitcoin broadcast evidence record field" "evidence[0].network is not supported in public Bitcoin broadcast evidence" run_audit "$unsupported_record_field" --require-ready

ready_bad_timestamp="$tmp_dir/ready-bad-timestamp.json"
cp "$ready" "$ready_bad_timestamp"
perl -0pi -e 's/2026-06-26T00:00:00Z/2026-06-26/' "$ready_bad_timestamp"
expect_failure "ready evidence bad timestamp" "timestamp must be an ISO-8601 UTC second timestamp" run_audit "$ready_bad_timestamp" --require-ready

ready_impossible_timestamp="$tmp_dir/ready-impossible-timestamp.json"
cp "$ready" "$ready_impossible_timestamp"
perl -0pi -e 's/2026-06-26T00:00:00Z/2026-99-99T99:99:99Z/' "$ready_impossible_timestamp"
expect_failure "ready evidence impossible timestamp fields" "timestamp must be an ISO-8601 UTC second timestamp" run_audit "$ready_impossible_timestamp" --require-ready

ready_invalid_leap_day="$tmp_dir/ready-invalid-leap-day.json"
cp "$ready" "$ready_invalid_leap_day"
perl -0pi -e 's/2026-06-26T00:00:00Z/2025-02-29T00:00:00Z/' "$ready_invalid_leap_day"
expect_failure "ready evidence invalid leap-day timestamp" "timestamp must be an ISO-8601 UTC second timestamp" run_audit "$ready_invalid_leap_day" --require-ready

ready_future_timestamp="$tmp_dir/ready-future-timestamp.json"
cp "$ready" "$ready_future_timestamp"
perl -0pi -e 's/2026-06-26T00:00:00Z/2999-01-01T00:00:00Z/' "$ready_future_timestamp"
expect_failure "ready evidence future timestamp" "timestamp must not be in the future" run_audit "$ready_future_timestamp" --require-ready

future_block_response="$tmp_dir/response-future-block.json"
cp "$indexer_fixture" "$future_block_response"
node - "$future_block_response" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response.body.status.block_time = 1782432601;
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
indexer_fixture="$future_block_response" expect_failure "future confirmed indexer block time" "confirmed indexer transaction block_time must not be in the future" run_audit "$ready" --require-ready

boundary_timestamp_manifest="$tmp_dir/ready-clock-skew-boundary.json"
cp "$ready" "$boundary_timestamp_manifest"
perl -0pi -e 's/2026-06-26T00:00:00Z/2026-06-26T00:10:00Z/' "$boundary_timestamp_manifest"
boundary_block_response="$tmp_dir/response-clock-skew-boundary.json"
cp "$tmp_dir/indexer-fixture.json" "$boundary_block_response"
node - "$boundary_block_response" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response.body.status.block_time = 1782432600;
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
indexer_fixture="$boundary_block_response" expect_success "exact future clock-skew boundary" run_audit "$boundary_timestamp_manifest" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_bad_commit="$tmp_dir/ready-bad-commit.json"
cp "$ready" "$ready_bad_commit"
perl -0pi -e 's/89abcdef89abcdef89abcdef89abcdef89abcdef/3333/' "$ready_bad_commit"
expect_failure "ready evidence bad commit" "commit must be a 40-character git commit" run_audit "$ready_bad_commit" --require-ready

ready_placeholder_commit="$tmp_dir/ready-placeholder-commit.json"
cp "$ready" "$ready_placeholder_commit"
perl -0pi -e 's/89abcdef89abcdef89abcdef89abcdef89abcdef/3333333333333333333333333333333333333333/' "$ready_placeholder_commit"
expect_failure "ready evidence placeholder commit" "commit must not be a placeholder git commit" run_audit "$ready_placeholder_commit" --require-ready

ready_wrong_current_commit="$tmp_dir/ready-wrong-current-commit.json"
cp "$ready" "$ready_wrong_current_commit"
perl -0pi -e 's/89abcdef89abcdef89abcdef89abcdef89abcdef/abcdef0123456789abcdef0123456789abcdef01/' "$ready_wrong_current_commit"
expect_failure "ready evidence wrong current commit" "ready Bitcoin broadcast evidence requires at least one indexer-verified funded testnet broadcast record for current release commit" run_audit "$ready_wrong_current_commit" --require-ready

BITCOIN_BROADCAST_EVIDENCE_COMMIT=not-a-commit expect_failure "ready evidence forbidden current commit override" "BITCOIN_BROADCAST_EVIDENCE_COMMIT is forbidden" run_audit "$ready" --require-ready

printf '%s\n' 'not-a-commit' >"$tmp_dir/current-commit.txt"
expect_failure "ready evidence invalid confined current commit fixture" "current release commit must be a 40-character git commit" run_audit "$ready" --require-ready
printf '%s\n' '89abcdef89abcdef89abcdef89abcdef89abcdef' >"$tmp_dir/current-commit.txt"

secret_top_level="$tmp_dir/secret-top-level.json"
cp "$ready" "$secret_top_level"
perl -0pi -e 's/"evidence": \[/"mnemonic": "do-not-commit",\n  "evidence": [/' "$secret_top_level"
expect_failure "secret-like Bitcoin broadcast evidence key" "must not be included in public Bitcoin broadcast evidence" run_audit "$secret_top_level" --require-ready

secret_nested="$tmp_dir/secret-nested.json"
cp "$ready" "$secret_nested"
perl -0pi -e 's/"commit": "89abcdef89abcdef89abcdef89abcdef89abcdef"/"commit": "89abcdef89abcdef89abcdef89abcdef89abcdef",\n      "authorization": "Bearer do-not-commit"/' "$secret_nested"
expect_failure "nested secret-like Bitcoin broadcast evidence key" "must not be included in public Bitcoin broadcast evidence" run_audit "$secret_nested" --require-ready

secret_value="$tmp_dir/secret-value.json"
cp "$ready" "$secret_value"
node - "$secret_value" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].sourceAddress = 'tb1qghp_12345678901234567890';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "secret-like Bitcoin broadcast evidence value" "sourceAddress must not contain secret-like token" run_audit "$secret_value" --require-ready

canonical_fixture="$tmp_dir/indexer-fixture.json"

# Production mode must never accept environment-selected roots, commits,
# fixtures, tools, or clocks, even for the otherwise harmless blocked manifest.
for override_name in \
  BITCOIN_BROADCAST_EVIDENCE_ROOT \
  BITCOIN_BROADCAST_EVIDENCE_INDEXER_FIXTURE \
  BITCOIN_BROADCAST_EVIDENCE_CURL \
  BITCOIN_BROADCAST_EVIDENCE_GIT \
  BITCOIN_BROADCAST_EVIDENCE_NOW \
  BITCOIN_BROADCAST_EVIDENCE_NODE; do
  expect_failure \
    "forbidden ambient override $override_name" \
    "$override_name is forbidden" \
    /usr/bin/env "$override_name=$tmp_dir/attacker" /bin/bash "$AUDIT_SCRIPT" --evidence "$blocked"
done

# Exact URL equality rejects parser differentials and authority/path tricks.
url_case_index=0
while IFS='|' read -r url_case_name url_case_value; do
  [[ -n "$url_case_name" ]] || continue
  url_case_index=$((url_case_index + 1))
  url_case_file="$tmp_dir/url-case-$url_case_index.json"
  write_indexer_url_variant "$ready" "$url_case_file" "$url_case_value"
  expect_failure \
    "Bitcoin indexer URL attack: $url_case_name" \
    "indexerUrl must be exactly the reviewed origin and path" \
    run_audit "$url_case_file" --require-ready
done <<'CASES'
userinfo-host-confusion|https://blockstream.info@evil.example/testnet/api
userinfo-password-confusion|https://blockstream.info:secret@evil.example/testnet/api
idn-homograph|https://blockstreɑm.info/testnet/api
punycode-homograph|https://xn--blockstream-9za.info/testnet/api
percent-encoded-host|https://%62lockstream.info/testnet/api
uppercase-host|https://BLOCKSTREAM.INFO/testnet/api
explicit-default-port|https://blockstream.info:443/testnet/api
unexpected-port|https://blockstream.info:444/testnet/api
trailing-slash|https://blockstream.info/testnet/api/
double-slash-path|https://blockstream.info/testnet//api
encoded-path-byte|https://blockstream.info/testnet/%61pi
encoded-path-traversal|https://blockstream.info/testnet/api/%2e%2e
query-confusion|https://blockstream.info/testnet/api?next=https://evil.example
fragment-confusion|https://blockstream.info/testnet/api#@evil.example
CASES

# A successful proof requires an exact, direct, bounded JSON response.
bad_status_response="$tmp_dir/response-status-204.json"
write_response_field_variant "$canonical_fixture" "$bad_status_response" status '204'
indexer_fixture="$bad_status_response" expect_failure "non-200 indexer response" "indexer HTTP status must be exactly 200" run_audit "$ready" --require-ready

redirect_status_response="$tmp_dir/response-status-302.json"
write_response_field_variant "$canonical_fixture" "$redirect_status_response" status '302'
indexer_fixture="$redirect_status_response" expect_failure "redirect status response" "indexer HTTP status must be exactly 200" run_audit "$ready" --require-ready

redirect_count_response="$tmp_dir/response-redirect-count.json"
write_response_field_variant "$canonical_fixture" "$redirect_count_response" redirectCount '1'
indexer_fixture="$redirect_count_response" expect_failure "followed indexer redirect" "indexer response must not follow redirects" run_audit "$ready" --require-ready

redirect_url_response="$tmp_dir/response-effective-url.json"
write_response_field_variant "$canonical_fixture" "$redirect_url_response" effectiveUrl '"https://evil.example/tx/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"'
indexer_fixture="$redirect_url_response" expect_failure "changed effective indexer URL" "indexer effective URL must remain exactly" run_audit "$ready" --require-ready

html_response="$tmp_dir/response-html.json"
write_response_field_variant "$canonical_fixture" "$html_response" contentType '"text/html"'
indexer_fixture="$html_response" expect_failure "HTML indexer response" "indexer Content-Type must be exactly application/json" run_audit "$ready" --require-ready

charset_response="$tmp_dir/response-json-charset.json"
write_response_field_variant "$canonical_fixture" "$charset_response" contentType '"application/json; charset=utf-8"'
indexer_fixture="$charset_response" expect_failure "non-exact JSON content type" "indexer Content-Type must be exactly application/json" run_audit "$ready" --require-ready

unsupported_transport_field="$tmp_dir/response-extra-field.json"
write_response_field_variant "$canonical_fixture" "$unsupported_transport_field" location '"https://evil.example"'
indexer_fixture="$unsupported_transport_field" expect_failure "unsupported transport metadata" "indexer transport response contains unsupported field location" run_audit "$ready" --require-ready

null_body_response="$tmp_dir/response-null-body.json"
write_response_field_variant "$canonical_fixture" "$null_body_response" body 'null'
indexer_fixture="$null_body_response" expect_failure "null indexer response body" "indexer transaction response must be an object" run_audit "$ready" --require-ready

mismatched_txid_response="$tmp_dir/response-mismatched-txid.json"
cp "$canonical_fixture" "$mismatched_txid_response"
node - "$mismatched_txid_response" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response.body.txid = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
indexer_fixture="$mismatched_txid_response" expect_failure "mismatched response transaction id" "indexer transaction txid does not match evidence txid" run_audit "$ready" --require-ready

malformed_response="$tmp_dir/response-malformed.json"
printf '{' >"$malformed_response"
indexer_fixture="$malformed_response" expect_failure "malformed indexer JSON response" "self-test indexer response must be valid JSON" run_audit "$ready" --require-ready

invalid_utf8_response="$tmp_dir/response-invalid-utf8.json"
printf '\377' >"$invalid_utf8_response"
indexer_fixture="$invalid_utf8_response" expect_failure "invalid UTF-8 indexer response" "self-test indexer response must be valid UTF-8" run_audit "$ready" --require-ready

oversize_response="$tmp_dir/response-oversize.json"
node - "$canonical_fixture" "$oversize_response" <<'NODE'
const fs = require('fs');
const [source, destination] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(source, 'utf8'));
response.body.padding = 'x'.repeat(1024 * 1024 + 1);
fs.writeFileSync(destination, JSON.stringify(response));
NODE
indexer_fixture="$oversize_response" expect_failure "oversize indexer response" "indexer response body exceeds 1048576 bytes" run_audit "$ready" --require-ready
indexer_fixture="$canonical_fixture"

stale_evidence="$tmp_dir/ready-stale-evidence.json"
cp "$ready" "$stale_evidence"
node - "$stale_evidence" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence[0].timestamp = '2026-06-01T00:00:00Z';
manifest.lastReviewed = '2026-06-26';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "stale funded broadcast evidence" "timestamp is stale; release evidence must be at most 7 days old" run_audit "$stale_evidence" --require-ready

delayed_record_response="$tmp_dir/response-delayed-record.json"
cp "$canonical_fixture" "$delayed_record_response"
node - "$delayed_record_response" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response.body.status.block_time = 1782255600;
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
indexer_fixture="$delayed_record_response" expect_failure "evidence recorded too long after block" "timestamp is too far after the confirmed transaction block_time" run_audit "$ready" --require-ready

stale_block_response="$tmp_dir/response-stale-block.json"
cp "$canonical_fixture" "$stale_block_response"
node - "$stale_block_response" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
response.body.status.block_time = 1780272000;
fs.writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
NODE
indexer_fixture="$stale_block_response" expect_failure "stale confirmed indexer transaction" "confirmed indexer transaction is stale" run_audit "$ready" --require-ready
indexer_fixture="$canonical_fixture"

# Self-test seams are explicit and confined: paths cannot escape or use links.
outside_response="$(mktemp)"
write_indexer_fixture "$outside_response"
expect_failure "self-test response outside fixture root" "self-test indexer response must remain beneath the self-test fixture root" \
  /bin/bash "$AUDIT_SCRIPT" --selftest-fixture-root "$tmp_dir" --selftest-indexer-response "$outside_response" --evidence "$ready" --require-ready
rm -f "$outside_response"

outside_evidence="$(mktemp)"
write_ready_manifest "$outside_evidence"
expect_failure "self-test evidence outside fixture root" "self-test evidence manifest must remain beneath the self-test fixture root" \
  /bin/bash "$AUDIT_SCRIPT" --selftest-fixture-root "$tmp_dir" --selftest-indexer-response "$canonical_fixture" --evidence "$outside_evidence" --require-ready
rm -f "$outside_evidence"

symlink_response="$tmp_dir/symlink-response.json"
ln -s "$canonical_fixture" "$symlink_response"
indexer_fixture="$symlink_response" expect_failure "symlinked self-test response" "self-test indexer response must be a regular file and must not be a symlink" run_audit "$ready" --require-ready
rm -f "$symlink_response"
indexer_fixture="$canonical_fixture"

symlink_evidence="$tmp_dir/symlink-evidence.json"
ln -s "$ready" "$symlink_evidence"
expect_failure "symlinked self-test evidence" "self-test evidence manifest must be a regular file and must not be a symlink" run_audit "$symlink_evidence" --require-ready
rm -f "$symlink_evidence"

expect_failure "partial self-test seam" "--selftest-fixture-root and --selftest-indexer-response must be supplied together" \
  /bin/bash "$AUDIT_SCRIPT" --selftest-fixture-root "$tmp_dir" --evidence "$blocked"
expect_failure "relative self-test root" "self-test fixture root must be an absolute path" \
  /bin/bash "$AUDIT_SCRIPT" --selftest-fixture-root . --selftest-indexer-response "$canonical_fixture" --evidence "$ready" --require-ready

printf '%s\n' 'not-a-time' >"$tmp_dir/current-time.txt"
expect_failure "malformed confined clock fixture" "self-test current-time fixture must contain one ISO-8601 UTC second timestamp" run_audit "$ready" --require-ready
printf '%s\n' '2026-06-26T00:05:00Z' >"$tmp_dir/current-time.txt"

clock_target="$tmp_dir/clock-target.txt"
printf '%s\n' '2026-06-26T00:05:00Z' >"$clock_target"
mv "$tmp_dir/current-time.txt" "$tmp_dir/current-time-original.txt"
ln -s "$clock_target" "$tmp_dir/current-time.txt"
expect_failure "symlinked confined clock fixture" "self-test current-time fixture must be a regular file and must not be a symlink" run_audit "$ready" --require-ready
rm -f "$tmp_dir/current-time.txt"
mv "$tmp_dir/current-time-original.txt" "$tmp_dir/current-time.txt"

commit_target="$tmp_dir/commit-target.txt"
printf '%s\n' '89abcdef89abcdef89abcdef89abcdef89abcdef' >"$commit_target"
mv "$tmp_dir/current-commit.txt" "$tmp_dir/current-commit-original.txt"
ln -s "$commit_target" "$tmp_dir/current-commit.txt"
expect_failure "symlinked confined commit fixture" "self-test current-commit fixture must be a regular file and must not be a symlink" run_audit "$ready" --require-ready
rm -f "$tmp_dir/current-commit.txt"
mv "$tmp_dir/current-commit-original.txt" "$tmp_dir/current-commit.txt"

# Ambient curl/git configuration, proxies, CA overrides, PATH shims and exported
# shell functions cannot influence the isolated verifier contract.
attack_home="$tmp_dir/attack-home"
attack_bin="$tmp_dir/attack-bin"
attack_marker="$tmp_dir/ambient-tool-was-executed"
node_preload="$tmp_dir/attacker-node-preload.cjs"
mkdir -p "$attack_home/xdg" "$attack_bin"
printf '%s\n' 'url = "https://evil.example"' 'location' >"$attack_home/.curlrc"
printf '%s\n' '#!/bin/sh' "printf attacked >'$attack_marker'" 'exit 0' >"$attack_bin/curl"
printf '%s\n' '#!/bin/sh' "printf attacked >'$attack_marker'" 'exit 0' >"$attack_bin/git"
printf '%s\n' '#!/bin/sh' "printf attacked >'$attack_marker'" 'exit 0' >"$attack_bin/node"
printf '%s\n' "require('fs').writeFileSync('$attack_marker', 'attacked');" >"$node_preload"
chmod +x "$attack_bin/curl" "$attack_bin/git" "$attack_bin/node"
expect_success "ambient curlrc/proxy/CA/PATH attack" \
  /usr/bin/env \
    HOME="$attack_home" \
    XDG_CONFIG_HOME="$attack_home/xdg" \
    CURL_HOME="$attack_home" \
    http_proxy="http://evil.example:8080" \
    https_proxy="http://evil.example:8080" \
    ALL_PROXY="socks5://evil.example:1080" \
    SSL_CERT_FILE="$attack_home/evil-ca.pem" \
    SSL_CERT_DIR="$attack_home" \
    CURL_CA_BUNDLE="$attack_home/evil-ca.pem" \
    NODE_OPTIONS="--require=$node_preload" \
    NODE_PATH="$attack_home" \
    PATH="$attack_bin:$PATH" \
    /bin/bash "$AUDIT_SCRIPT" \
      --selftest-fixture-root "$tmp_dir" \
      --selftest-indexer-response "$canonical_fixture" \
      --evidence "$ready" \
      --require-ready
[[ ! -e "$attack_marker" ]] || fail "ambient PATH shim was executed"

curl() { printf 'attacked' >"$attack_marker"; }
git() { printf 'attacked' >"$attack_marker"; }
export -f curl git
expect_success "exported curl/git function attack" run_audit "$ready" --require-ready
export -n -f curl git
unset -f curl git
[[ ! -e "$attack_marker" ]] || fail "exported curl/git function was executed"

[[ "$negative_count" == "103" ]] || fail "expected exactly 103 negative/adversarial cases, found $negative_count"

echo "[bitcoin-broadcast-evidence-test] all assertions passed (103 negative/adversarial cases)"
