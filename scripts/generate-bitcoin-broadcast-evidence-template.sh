#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${BITCOIN_BROADCAST_EVIDENCE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MANIFEST_FILE="$ROOT_DIR/scripts/bitcoin-testnet-broadcast-evidence.json"
OUTPUT_FILE=""

usage() {
  cat <<'USAGE'
Usage: scripts/generate-bitcoin-broadcast-evidence-template.sh [--manifest <path>] [--output <path>]

Generates a fill-in-ready Bitcoin testnet broadcast evidence manifest from the
committed evidence schema. The generated template intentionally contains TODO
placeholders and must fail the release-ready audit until a funded broadcast is
recorded.
USAGE
}

while (($#)); do
  case "$1" in
    --manifest)
      [[ $# -ge 2 ]] || { echo "[bitcoin-broadcast-template][error] --manifest requires a path" >&2; exit 2; }
      MANIFEST_FILE="$2"
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || { echo "[bitcoin-broadcast-template][error] --output requires a path" >&2; exit 2; }
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[bitcoin-broadcast-template][error] Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[bitcoin-broadcast-template][error] node is required for structured JSON generation" >&2
  exit 1
fi

node - "$MANIFEST_FILE" "$OUTPUT_FILE" <<'NODE'
const fs = require('fs');
const path = require('path');

const [manifestFile, outputFile] = process.argv.slice(2);
const errors = [];

const REQUIRED_EVIDENCE_FIELDS = [
  'txid',
  'sourceAddress',
  'recipientAddress',
  'amountSat',
  'outpoint',
  'indexerUrl',
  'timestamp',
  'operator',
  'commit'
];
const PLACEHOLDERS = {
  txid: 'TODO_64_HEX_TESTNET_TXID',
  sourceAddress: 'TODO_TESTNET_SOURCE_TB1Q_ADDRESS',
  recipientAddress: 'TODO_TESTNET_RECIPIENT_TB1Q_ADDRESS',
  amountSat: 'TODO_POSITIVE_INTEGER_SATS',
  outpoint: 'TODO_64_HEX_FUNDING_TXID:TODO_VOUT',
  indexerUrl: null,
  timestamp: 'TODO_UTC_TIMESTAMP_SECONDS',
  operator: 'TODO_RELEASE_OPERATOR',
  commit: 'TODO_40_HEX_GIT_COMMIT'
};
const ALLOWED_MANIFEST_FIELDS = [
  'schemaVersion',
  'scope',
  'status',
  'releaseEnabled',
  'lastReviewed',
  'blockers',
  'smokeCommand',
  'readyVerificationCommands',
  'liveSmokeEnvironment',
  'defaultIndexerUrl',
  'requiredEvidenceFields',
  'evidence'
];

function fail(message) {
  errors.push(message);
}

function readManifest(file) {
  if (!fs.existsSync(file)) {
    fail(`Bitcoin broadcast evidence manifest missing: ${file}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Bitcoin broadcast evidence manifest must be valid JSON: ${error.message}`);
    return null;
  }
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    fail(`${name} must be an array`);
    return [];
  }

  return value;
}

function secretLikeKeyReason(value, currentPath = '$') {
  if (!value || typeof value !== 'object') {
    return null;
  }

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

function rejectUnsupportedKeys(value, allowedFields, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      fail(`${path}.${field} is not supported in public Bitcoin broadcast evidence manifest`);
    }
  }
}

function validateCommittedEvidence(value) {
  const evidence = requireArray(value, 'evidence');
  evidence.forEach((record, index) => {
    const path = `evidence[${index}]`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail(`${path} must be an object`);
      return;
    }
    rejectUnsupportedKeys(record, REQUIRED_EVIDENCE_FIELDS, path);
  });

  if (evidence.length > 0) {
    fail('committed Bitcoin broadcast evidence manifest must not prefill evidence');
  }
}

const manifest = readManifest(manifestFile);

if (manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('manifest must be an object');
  }

  const secretLikePath = secretLikeKeyReason(manifest);
  if (secretLikePath) {
    fail(`${secretLikePath} must not be read from public Bitcoin broadcast evidence manifest`);
  }
  rejectUnsupportedKeys(manifest, ALLOWED_MANIFEST_FIELDS, 'manifest');

  if (manifest.schemaVersion !== 1) {
    fail('schemaVersion must be 1');
  }

  if (manifest.scope !== 'web-bitcoin-testnet-broadcast-readiness') {
    fail('scope must be web-bitcoin-testnet-broadcast-readiness');
  }

  if (manifest.smokeCommand !== 'yarn test:smoke:bitcoin') {
    fail('smokeCommand must be yarn test:smoke:bitcoin');
  }

  try {
    const url = new URL(String(manifest.defaultIndexerUrl || ''));
    if (url.protocol !== 'https:') {
      fail('defaultIndexerUrl must use https');
    }
  } catch {
    fail('defaultIndexerUrl must be a valid URL');
  }

  const requiredFields = requireArray(manifest.requiredEvidenceFields, 'requiredEvidenceFields');
  const requiredFieldSet = new Set(requiredFields);

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!requiredFieldSet.has(field)) {
      fail(`requiredEvidenceFields missing ${field}`);
    }
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(PLACEHOLDERS, field)) {
      fail(`unsupported evidence field in manifest: ${field}`);
    }
  }

  requireArray(manifest.readyVerificationCommands, 'readyVerificationCommands');
  requireArray(manifest.liveSmokeEnvironment, 'liveSmokeEnvironment');
  validateCommittedEvidence(manifest.evidence);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[bitcoin-broadcast-template][error] ${error}`);
  }
  process.exit(1);
}

const evidence = {};
for (const field of manifest.requiredEvidenceFields) {
  evidence[field] = field === 'indexerUrl' ? manifest.defaultIndexerUrl : PLACEHOLDERS[field];
}

const template = {
  schemaVersion: manifest.schemaVersion,
  scope: manifest.scope,
  status: 'ready',
  releaseEnabled: true,
  lastReviewed: 'TODO_YYYY_MM_DD',
  blockers: [],
  smokeCommand: manifest.smokeCommand,
  readyVerificationCommands: manifest.readyVerificationCommands,
  liveSmokeEnvironment: manifest.liveSmokeEnvironment,
  defaultIndexerUrl: manifest.defaultIndexerUrl,
  requiredEvidenceFields: manifest.requiredEvidenceFields,
  evidence: [evidence]
};

const output = `${JSON.stringify(template, null, 2)}\n`;

if (outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, output);
}

process.stdout.write(output);
NODE
