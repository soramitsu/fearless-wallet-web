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
      "txid": "1111111111111111111111111111111111111111111111111111111111111111",
      "sourceAddress": "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
      "recipientAddress": "tb1q2mhcnxyddvq4vxja3mg5t73uknyppfx2u4k54f",
      "amountSat": "1000",
      "outpoint": "2222222222222222222222222222222222222222222222222222222222222222:0",
      "indexerUrl": "https://blockstream.info/testnet/api",
      "timestamp": "2026-06-26T00:00:00Z",
      "operator": "release",
      "commit": "3333333333333333333333333333333333333333"
    }
  ]
}
JSON
}

run_audit() {
  local manifest="$1"
  shift
  bash "$AUDIT_SCRIPT" --evidence "$manifest" "$@"
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
write_blocked_manifest "$blocked"
write_ready_manifest "$ready"

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

missing_env="$tmp_dir/missing-env.json"
cp "$blocked" "$missing_env"
perl -0pi -e 's/,\n    "FEARLESS_BITCOIN_TESTNET_OUTPOINT"//' "$missing_env"
expect_failure "missing live smoke env contract" "liveSmokeEnvironment missing FEARLESS_BITCOIN_TESTNET_OUTPOINT" run_audit "$missing_env"

missing_ready_command="$tmp_dir/missing-ready-command.json"
cp "$blocked" "$missing_ready_command"
perl -0pi -e 's/yarn audit:bitcoin-broadcast-evidence --require-ready/yarn audit:bitcoin-broadcast-evidence/' "$missing_ready_command"
expect_failure "missing require-ready command" "readyVerificationCommands missing yarn audit:bitcoin-broadcast-evidence --require-ready" run_audit "$missing_ready_command"

missing_required_field="$tmp_dir/missing-required-field.json"
cp "$blocked" "$missing_required_field"
perl -0pi -e 's/"txid",\n//' "$missing_required_field"
expect_failure "missing txid evidence field" "requiredEvidenceFields missing txid" run_audit "$missing_required_field"

ready_no_evidence="$tmp_dir/ready-no-evidence.json"
cp "$ready" "$ready_no_evidence"
perl -0pi -e 's/"evidence": \[[\s\S]*?\n  \]/"evidence": []/' "$ready_no_evidence"
expect_failure "ready evidence without funded broadcast" "ready Bitcoin broadcast evidence requires at least one funded testnet broadcast record" run_audit "$ready_no_evidence" --require-ready

ready_bad_txid="$tmp_dir/ready-bad-txid.json"
cp "$ready" "$ready_bad_txid"
perl -0pi -e 's/1111111111111111111111111111111111111111111111111111111111111111/1234/' "$ready_bad_txid"
expect_failure "ready evidence bad txid" "txid must be a 64-character transaction id" run_audit "$ready_bad_txid" --require-ready

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
perl -0pi -e 's/2222222222222222222222222222222222222222222222222222222222222222:0/2222:0/' "$ready_bad_outpoint"
expect_failure "ready evidence bad outpoint" "outpoint must be formatted as <txid>:<vout>" run_audit "$ready_bad_outpoint" --require-ready

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

ready_bad_timestamp="$tmp_dir/ready-bad-timestamp.json"
cp "$ready" "$ready_bad_timestamp"
perl -0pi -e 's/2026-06-26T00:00:00Z/2026-06-26/' "$ready_bad_timestamp"
expect_failure "ready evidence bad timestamp" "timestamp must be an ISO-8601 UTC second timestamp" run_audit "$ready_bad_timestamp" --require-ready

ready_bad_commit="$tmp_dir/ready-bad-commit.json"
cp "$ready" "$ready_bad_commit"
perl -0pi -e 's/3333333333333333333333333333333333333333/3333/' "$ready_bad_commit"
expect_failure "ready evidence bad commit" "commit must be a 40-character git commit" run_audit "$ready_bad_commit" --require-ready

echo "[bitcoin-broadcast-evidence-test] all assertions passed"
