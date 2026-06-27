#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GENERATOR_SCRIPT="$SCRIPT_DIR/generate-bitcoin-broadcast-evidence-template.sh"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-bitcoin-broadcast-evidence.sh"
DEFAULT_MANIFEST="$SCRIPT_DIR/bitcoin-testnet-broadcast-evidence.json"

fail() {
  echo "[bitcoin-broadcast-template-test][error] $*" >&2
  exit 1
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

stdout_template="$tmp_dir/stdout-template.json"
output_template="$tmp_dir/output-template.json"

bash "$GENERATOR_SCRIPT" --manifest "$DEFAULT_MANIFEST" >"$stdout_template"
bash "$GENERATOR_SCRIPT" --manifest "$DEFAULT_MANIFEST" --output "$output_template" >"$tmp_dir/output-stdout.json"
cmp "$output_template" "$tmp_dir/output-stdout.json" >/dev/null || fail "template output file must match stdout"
cmp "$stdout_template" "$output_template" >/dev/null || fail "template generation must be deterministic"

separator_template="$tmp_dir/separator-template.json"
bash "$GENERATOR_SCRIPT" -- --manifest "$DEFAULT_MANIFEST" --output "$separator_template" >"$tmp_dir/separator-stdout.json"
cmp "$output_template" "$separator_template" >/dev/null || fail "template generation must accept a standalone argument separator"
cmp "$separator_template" "$tmp_dir/separator-stdout.json" >/dev/null || fail "separator template output file must match stdout"

node - "$output_template" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const expectedPlaceholders = {
  txid: 'TODO_64_HEX_TESTNET_TXID',
  sourceAddress: 'TODO_TESTNET_SOURCE_TB1Q_ADDRESS',
  recipientAddress: 'TODO_TESTNET_RECIPIENT_TB1Q_ADDRESS',
  amountSat: 'TODO_POSITIVE_INTEGER_SATS',
  outpoint: 'TODO_64_HEX_FUNDING_TXID:TODO_VOUT',
  indexerUrl: 'https://blockstream.info/testnet/api',
  timestamp: 'TODO_UTC_TIMESTAMP_SECONDS',
  operator: 'TODO_RELEASE_OPERATOR',
  commit: 'TODO_40_HEX_GIT_COMMIT'
};

function check(condition, message) {
  if (!condition) errors.push(message);
}

function secretLikeKeyReason(value, currentPath = '$') {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const reason = secretLikeKeyReason(value[index], `${currentPath}[${index}]`);
      if (reason) return reason;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes('privatekey') ||
      normalized.includes('mnemonic') ||
      normalized.includes('seed') ||
      normalized.includes('secret') ||
      normalized.includes('password') ||
      normalized.includes('authorization') ||
      normalized.includes('credential') ||
      normalized.includes('clientdatajson')
    ) {
      return `${currentPath}.${key}`;
    }

    const reason = secretLikeKeyReason(child, `${currentPath}.${key}`);
    if (reason) return reason;
  }

  return null;
}

check(manifest.schemaVersion === 1, 'schemaVersion must be 1');
check(manifest.scope === 'web-bitcoin-testnet-broadcast-readiness', 'scope must match release evidence');
check(manifest.status === 'ready', 'template must show the operator target status');
check(manifest.releaseEnabled === true, 'template must show the operator target releaseEnabled value');
check(Array.isArray(manifest.blockers) && manifest.blockers.length === 0, 'template blockers must be empty');
check(Array.isArray(manifest.evidence) && manifest.evidence.length === 1, 'template must contain one evidence record');
check(secretLikeKeyReason(manifest) === null, 'template must not contain secret-like keys');

const evidence = manifest.evidence[0] || {};
for (const [field, value] of Object.entries(expectedPlaceholders)) {
  check(evidence[field] === value, `${field} placeholder mismatch`);
}

for (const field of manifest.requiredEvidenceFields || []) {
  check(Object.prototype.hasOwnProperty.call(evidence, field), `${field} missing from template evidence`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}
NODE

expect_failure \
  "template cannot pass ready audit with TODO placeholders" \
  "txid must be a 64-character transaction id" \
  bash "$AUDIT_SCRIPT" --evidence "$output_template" --require-ready

expect_failure "unknown generator argument" "Unknown argument" bash "$GENERATOR_SCRIPT" --nope
expect_failure "missing output argument" "--output requires a path" bash "$GENERATOR_SCRIPT" --output
expect_failure "missing manifest" "Bitcoin broadcast evidence manifest missing" bash "$GENERATOR_SCRIPT" --manifest "$tmp_dir/missing.json"

bad_json="$tmp_dir/bad-json.json"
printf '{' >"$bad_json"
expect_failure "invalid manifest JSON" "must be valid JSON" bash "$GENERATOR_SCRIPT" --manifest "$bad_json"

bad_scope="$tmp_dir/bad-scope.json"
cp "$DEFAULT_MANIFEST" "$bad_scope"
node - "$bad_scope" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.scope = 'web-bitcoin-mainnet-broadcast-readiness';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "wrong evidence scope" "scope must be web-bitcoin-testnet-broadcast-readiness" bash "$GENERATOR_SCRIPT" --manifest "$bad_scope"

unsupported_blocker="$tmp_dir/unsupported-blocker.json"
cp "$DEFAULT_MANIFEST" "$unsupported_blocker"
node - "$unsupported_blocker" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.blockers.push('manual-approval-pending');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported Bitcoin broadcast evidence blocker" "unsupported Bitcoin broadcast evidence blocker in manifest: manual-approval-pending" bash "$GENERATOR_SCRIPT" --manifest "$unsupported_blocker"

missing_required_field="$tmp_dir/missing-required-field.json"
cp "$DEFAULT_MANIFEST" "$missing_required_field"
node - "$missing_required_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.requiredEvidenceFields = manifest.requiredEvidenceFields.filter((field) => field !== 'outpoint');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "missing outpoint field" "requiredEvidenceFields missing outpoint" bash "$GENERATOR_SCRIPT" --manifest "$missing_required_field"

unsupported_field="$tmp_dir/unsupported-field.json"
cp "$DEFAULT_MANIFEST" "$unsupported_field"
node - "$unsupported_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.requiredEvidenceFields.push('network');
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported evidence field" "unsupported evidence field in manifest: network" bash "$GENERATOR_SCRIPT" --manifest "$unsupported_field"

unsupported_top_level="$tmp_dir/unsupported-top-level.json"
cp "$DEFAULT_MANIFEST" "$unsupported_top_level"
node - "$unsupported_top_level" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.network = 'testnet';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported top-level manifest field" "manifest.network is not supported in public Bitcoin broadcast evidence manifest" bash "$GENERATOR_SCRIPT" --manifest "$unsupported_top_level"

unsupported_record_field="$tmp_dir/unsupported-record-field.json"
cp "$DEFAULT_MANIFEST" "$unsupported_record_field"
node - "$unsupported_record_field" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence = [{ network: 'testnet' }];
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsupported Bitcoin broadcast evidence record field" "evidence[0].network is not supported in public Bitcoin broadcast evidence manifest" bash "$GENERATOR_SCRIPT" --manifest "$unsupported_record_field"

prefilled_evidence="$tmp_dir/prefilled-evidence.json"
cp "$DEFAULT_MANIFEST" "$prefilled_evidence"
node - "$prefilled_evidence" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.evidence = [{
  txid: 'a'.repeat(64),
  sourceAddress: 'tb1qsourceaddressxxxxxxxxxxxxxxxxxxxxxxxx',
  recipientAddress: 'tb1qrecipientaddressxxxxxxxxxxxxxxxxxxxxx',
  amountSat: 1000,
  outpoint: `${'b'.repeat(64)}:0`,
  indexerUrl: manifest.defaultIndexerUrl,
  timestamp: '2026-06-26T00:00:00Z',
  operator: 'release',
  commit: 'c'.repeat(40)
}];
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "prefilled Bitcoin broadcast evidence" "committed Bitcoin broadcast evidence manifest must not prefill evidence" bash "$GENERATOR_SCRIPT" --manifest "$prefilled_evidence"

secret_manifest="$tmp_dir/secret-manifest.json"
cp "$DEFAULT_MANIFEST" "$secret_manifest"
node - "$secret_manifest" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.mnemonic = 'do-not-commit';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "secret-like manifest key" "must not be read from public Bitcoin broadcast evidence manifest" bash "$GENERATOR_SCRIPT" --manifest "$secret_manifest"

http_indexer="$tmp_dir/http-indexer.json"
cp "$DEFAULT_MANIFEST" "$http_indexer"
node - "$http_indexer" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.defaultIndexerUrl = 'http://blockstream.info/testnet/api';
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
expect_failure "unsafe default indexer" "defaultIndexerUrl must use https" bash "$GENERATOR_SCRIPT" --manifest "$http_indexer"

echo "[bitcoin-broadcast-template-test] all assertions passed"
