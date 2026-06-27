#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-bitcoin-broadcast-evidence.sh"

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
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef": {
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
      "confirmed": false
    }
  }
}
JSON
}

run_audit() {
  local manifest="$1"
  shift
  BITCOIN_BROADCAST_EVIDENCE_INDEXER_FIXTURE="$indexer_fixture" bash "$AUDIT_SCRIPT" --evidence "$manifest" "$@"
}

expect_failure() {
  local name="$1"
  local expected="$2"
  shift 2
  local output

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

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

blocked="$tmp_dir/blocked.json"
ready="$tmp_dir/ready.json"
indexer_fixture="$tmp_dir/indexer-fixture.json"
write_blocked_manifest "$blocked"
write_ready_manifest "$ready"
write_indexer_fixture "$indexer_fixture"

run_audit "$blocked" >/dev/null
run_audit "$ready" --require-ready >/dev/null

expect_failure "missing Bitcoin broadcast evidence manifest" "Bitcoin broadcast evidence manifest missing" run_audit "$tmp_dir/missing.json"

bad_json="$tmp_dir/bad-json.json"
printf '{' >"$bad_json"
expect_failure "invalid Bitcoin broadcast evidence JSON" "must be valid JSON" run_audit "$bad_json"

bad_schema="$tmp_dir/bad-schema.json"
cp "$blocked" "$bad_schema"
perl -0pi -e 's/"schemaVersion": 1/"schemaVersion": 2/' "$bad_schema"
expect_failure "bad schema" "schemaVersion must be 1" run_audit "$bad_schema"

release_enabled_blocked="$tmp_dir/release-enabled-blocked.json"
cp "$blocked" "$release_enabled_blocked"
perl -0pi -e 's/"releaseEnabled": false/"releaseEnabled": true/' "$release_enabled_blocked"
expect_failure "release enabled while blocked" "releaseEnabled must remain false while Bitcoin broadcast evidence is blocked" run_audit "$release_enabled_blocked"

missing_blocker="$tmp_dir/missing-blocker.json"
cp "$blocked" "$missing_blocker"
perl -0pi -e 's/"funded-testnet-broadcast-evidence-missing"//' "$missing_blocker"
expect_failure "blocked evidence missing funded broadcast blocker" "blocked evidence missing blocker funded-testnet-broadcast-evidence-missing" run_audit "$missing_blocker"

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
expect_failure "ready evidence without funded broadcast" "ready Bitcoin broadcast evidence requires at least one funded testnet broadcast record" run_audit "$ready_no_evidence" --require-ready

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
indexer_fixture="$missing_indexer_fixture" expect_failure "ready evidence missing indexer tx" "txid was not found in Bitcoin broadcast indexer fixture" run_audit "$ready_missing_indexer_tx" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

ready_wrong_recipient_output="$tmp_dir/ready-wrong-recipient-output.json"
wrong_recipient_fixture="$tmp_dir/wrong-recipient-fixture.json"
cp "$ready" "$ready_wrong_recipient_output"
cp "$indexer_fixture" "$wrong_recipient_fixture"
node - "$wrong_recipient_fixture" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
fixture['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'].vout[0].value = 999;
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
fixture['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'].vin[0].vout = 1;
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
fixture['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'].vin[0].prevout.scriptpubkey_address = 'tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f';
fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
NODE
indexer_fixture="$wrong_source_fixture" expect_failure "ready evidence wrong source address" "funding outpoint source address does not match evidence sourceAddress" run_audit "$ready_wrong_source" --require-ready
indexer_fixture="$tmp_dir/indexer-fixture.json"

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

ready_future_timestamp="$tmp_dir/ready-future-timestamp.json"
cp "$ready" "$ready_future_timestamp"
perl -0pi -e 's/2026-06-26T00:00:00Z/2999-01-01T00:00:00Z/' "$ready_future_timestamp"
expect_failure "ready evidence future timestamp" "timestamp must not be in the future" run_audit "$ready_future_timestamp" --require-ready

ready_bad_commit="$tmp_dir/ready-bad-commit.json"
cp "$ready" "$ready_bad_commit"
perl -0pi -e 's/89abcdef89abcdef89abcdef89abcdef89abcdef/3333/' "$ready_bad_commit"
expect_failure "ready evidence bad commit" "commit must be a 40-character git commit" run_audit "$ready_bad_commit" --require-ready

ready_placeholder_commit="$tmp_dir/ready-placeholder-commit.json"
cp "$ready" "$ready_placeholder_commit"
perl -0pi -e 's/89abcdef89abcdef89abcdef89abcdef89abcdef/3333333333333333333333333333333333333333/' "$ready_placeholder_commit"
expect_failure "ready evidence placeholder commit" "commit must not be a placeholder git commit" run_audit "$ready_placeholder_commit" --require-ready

secret_top_level="$tmp_dir/secret-top-level.json"
cp "$ready" "$secret_top_level"
perl -0pi -e 's/"evidence": \[/"mnemonic": "do-not-commit",\n  "evidence": [/' "$secret_top_level"
expect_failure "secret-like Bitcoin broadcast evidence key" "must not be included in public Bitcoin broadcast evidence" run_audit "$secret_top_level" --require-ready

secret_nested="$tmp_dir/secret-nested.json"
cp "$ready" "$secret_nested"
perl -0pi -e 's/"commit": "89abcdef89abcdef89abcdef89abcdef89abcdef"/"commit": "89abcdef89abcdef89abcdef89abcdef89abcdef",\n      "authorization": "Bearer do-not-commit"/' "$secret_nested"
expect_failure "nested secret-like Bitcoin broadcast evidence key" "must not be included in public Bitcoin broadcast evidence" run_audit "$secret_nested" --require-ready

echo "[bitcoin-broadcast-evidence-test] all assertions passed"
