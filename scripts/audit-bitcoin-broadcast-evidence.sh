#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${BITCOIN_BROADCAST_EVIDENCE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
EVIDENCE_FILE="$ROOT_DIR/scripts/bitcoin-testnet-broadcast-evidence.json"
REQUIRE_READY=false

usage() {
  cat <<'USAGE'
Usage: scripts/audit-bitcoin-broadcast-evidence.sh [--evidence <path>] [--require-ready]

Validates the web Bitcoin funded-testnet broadcast evidence manifest. The
default audit allows the current blocked state, but refuses any ready or release
claim unless funded testnet broadcast evidence is recorded.
USAGE
}

while (($#)); do
  case "$1" in
    --evidence)
      [[ $# -ge 2 ]] || { echo "[bitcoin-broadcast-evidence][error] --evidence requires a path" >&2; exit 2; }
      EVIDENCE_FILE="$2"
      shift 2
      ;;
    --require-ready)
      REQUIRE_READY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[bitcoin-broadcast-evidence][error] Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[bitcoin-broadcast-evidence][error] node is required for structured JSON validation" >&2
  exit 1
fi

node - "$EVIDENCE_FILE" "$REQUIRE_READY" <<'NODE'
const fs = require('fs');

const [evidenceFile, requireReadyRaw] = process.argv.slice(2);
const requireReady = requireReadyRaw === 'true';
const errors = [];
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const REQUIRED_BLOCKERS = ['funded-testnet-broadcast-evidence-missing'];
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
const REQUIRED_ENV = [
  'FEARLESS_BITCOIN_TESTNET_LIVE',
  'FEARLESS_BITCOIN_TESTNET_MNEMONIC',
  'FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS',
  'FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS',
  'FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT',
  'FEARLESS_BITCOIN_TESTNET_OUTPOINT'
];
const REQUIRED_COMMAND_MARKERS = [
  'yarn test:bitcoin-broadcast-evidence-template',
  'yarn generate:bitcoin-broadcast-evidence-template -- --output build/reports/bitcoin-broadcast-evidence-template.json',
  'yarn test:bitcoin-broadcast-evidence-audit',
  'yarn audit:bitcoin-broadcast-evidence --require-ready',
  'FEARLESS_BITCOIN_TESTNET_LIVE=1 yarn test:smoke:bitcoin'
];

function fail(message) {
  errors.push(message);
}

function readJson(file) {
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

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
    return {};
  }

  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    fail(`${name} must be an array`);
    return [];
  }

  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTxid(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ''));
}

function isRepeatedHexPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8,}$/.test(normalized) && new Set(normalized).size === 1;
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values) {
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;

    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if (((top >> index) & 1) === 1) {
        checksum ^= BECH32_GENERATORS[index];
      }
    }
  }

  return checksum;
}

function expandHrp(hrp) {
  return [
    ...Array.from(hrp, (char) => char.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
  ];
}

function convertBits(values, fromBits, toBits, pad) {
  let accumulator = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  const result = [];

  for (const value of values) {
    if (value < 0 || value >> fromBits !== 0) return null;

    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    return null;
  }

  return result;
}

function isTestnetAddress(value) {
  const address = String(value || '');
  if (address !== address.trim() || address.length < 14 || address.length > 90) return false;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false;

  const normalized = address.toLowerCase();
  const separatorIndex = normalized.lastIndexOf('1');
  if (separatorIndex !== 2 || normalized.slice(0, separatorIndex) !== 'tb') return false;

  const data = Array.from(normalized.slice(separatorIndex + 1), (char) => BECH32_CHARSET.indexOf(char));
  if (data.some((item) => item === -1)) return false;
  if (bech32Polymod([...expandHrp('tb'), ...data]) !== 1) return false;

  const version = data[0];
  const program = convertBits(data.slice(1, -6), 5, 8, false);

  return version === 0 && Boolean(program) && program.length === 20;
}

function isPositiveInteger(value) {
  return /^(0|[1-9][0-9]*)$/.test(String(value || '')) && Number(value) > 0 && Number.isSafeInteger(Number(value));
}

function isOutpoint(value) {
  const match = /^([0-9a-f]{64}):(\d+)$/i.exec(String(value || ''));
  return Boolean(match && Number.isSafeInteger(Number(match[2])));
}

function isIsoUtcSecond(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(value || ''));
}

function isFutureTimestamp(value) {
  const millis = Date.parse(value);
  return Number.isFinite(millis) && millis > Date.now() + MAX_CLOCK_SKEW_MS;
}

function secretLikeKeyReason(value, path = '$') {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const reason = secretLikeKeyReason(value[index], `${path}[${index}]`);
      if (reason) {
        return reason;
      }
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
      return `${path}.${key}`;
    }

    const reason = secretLikeKeyReason(child, `${path}.${key}`);
    if (reason) {
      return reason;
    }
  }

  return null;
}

function rejectUnsupportedKeys(value, allowedFields, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key} is not supported in public Bitcoin broadcast evidence`);
    }
  }
}

const manifest = readJson(evidenceFile);

if (manifest) {
  requireObject(manifest, 'manifest');

  const secretLikePath = secretLikeKeyReason(manifest);
  if (secretLikePath) {
    fail(`${secretLikePath} must not be included in public Bitcoin broadcast evidence`);
  }
  rejectUnsupportedKeys(manifest, ALLOWED_MANIFEST_FIELDS, 'manifest');

  if (manifest.schemaVersion !== 1) {
    fail('schemaVersion must be 1');
  }

  if (manifest.scope !== 'web-bitcoin-testnet-broadcast-readiness') {
    fail('scope must be web-bitcoin-testnet-broadcast-readiness');
  }

  if (!['blocked', 'ready'].includes(manifest.status)) {
    fail('status must be blocked or ready');
  }

  if (typeof manifest.releaseEnabled !== 'boolean') {
    fail('releaseEnabled must be a boolean');
  }

  if (manifest.smokeCommand !== 'yarn test:smoke:bitcoin') {
    fail('smokeCommand must be yarn test:smoke:bitcoin');
  }

  if (manifest.defaultIndexerUrl !== 'https://blockstream.info/testnet/api') {
    fail('defaultIndexerUrl must be https://blockstream.info/testnet/api');
  }

  const manifestBlockers = requireArray(manifest.blockers, 'blockers');
  const blockers = new Set(manifestBlockers);
  const envVars = new Set(requireArray(manifest.liveSmokeEnvironment, 'liveSmokeEnvironment'));
  const commands = requireArray(manifest.readyVerificationCommands, 'readyVerificationCommands').join('\n');
  const requiredEvidenceFieldList = requireArray(manifest.requiredEvidenceFields, 'requiredEvidenceFields');
  const requiredEvidenceFields = new Set(requiredEvidenceFieldList);
  const evidence = requireArray(manifest.evidence, 'evidence');

  if (manifest.status === 'blocked') {
    for (const blocker of REQUIRED_BLOCKERS) {
      if (!blockers.has(blocker)) {
        fail(`blocked evidence missing blocker ${blocker}`);
      }
    }
  }

  if (manifest.status === 'blocked' && manifest.releaseEnabled) {
    fail('releaseEnabled must remain false while Bitcoin broadcast evidence is blocked');
  }

  if (requireReady && manifest.status !== 'ready') {
    fail('status must be ready when --require-ready is used');
  }

  for (const envName of REQUIRED_ENV) {
    if (!envVars.has(envName)) {
      fail(`liveSmokeEnvironment missing ${envName}`);
    }
  }

  for (const marker of REQUIRED_COMMAND_MARKERS) {
    if (!commands.includes(marker)) {
      fail(`readyVerificationCommands missing ${marker}`);
    }
  }

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!requiredEvidenceFields.has(field)) {
      fail(`requiredEvidenceFields missing ${field}`);
    }
  }
  for (const field of requiredEvidenceFieldList) {
    if (!REQUIRED_EVIDENCE_FIELDS.includes(field)) {
      fail(`unsupported Bitcoin broadcast evidence field in manifest: ${field}`);
    }
  }

  const readyClaimed = manifest.status === 'ready' || manifest.releaseEnabled || requireReady;
  if (readyClaimed) {
    if (!manifest.releaseEnabled) {
      fail('releaseEnabled must be true when Bitcoin broadcast evidence is ready');
    }

    if (manifestBlockers.length > 0) {
      fail('blockers must be empty when Bitcoin broadcast evidence is ready');
    }

    if (evidence.length === 0) {
      fail('ready Bitcoin broadcast evidence requires at least one funded testnet broadcast record');
    }
  }

  const seenTxids = new Set();
  evidence.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`evidence[${index}] must be an object`);
      return;
    }
    rejectUnsupportedKeys(entry, REQUIRED_EVIDENCE_FIELDS, `evidence[${index}]`);

    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      if (!nonEmptyString(entry[field])) {
        fail(`evidence[${index}].${field} must not be blank`);
      }
    }

    if (!isTxid(entry.txid)) {
      fail(`evidence[${index}].txid must be a 64-character transaction id`);
    }

    const txid = String(entry.txid || '').toLowerCase();
    if (isRepeatedHexPlaceholder(txid)) {
      fail(`evidence[${index}].txid must not be a placeholder transaction id`);
    }
    if (seenTxids.has(txid)) {
      fail(`duplicate Bitcoin broadcast txid evidence: ${txid}`);
    }
    seenTxids.add(txid);

    if (!isTestnetAddress(entry.sourceAddress)) {
      fail(`evidence[${index}].sourceAddress must be a Bitcoin testnet address`);
    }

    if (!isTestnetAddress(entry.recipientAddress)) {
      fail(`evidence[${index}].recipientAddress must be a Bitcoin testnet address`);
    }

    if (entry.sourceAddress === entry.recipientAddress) {
      fail(`evidence[${index}].sourceAddress and recipientAddress must be different`);
    }

    if (!isPositiveInteger(entry.amountSat)) {
      fail(`evidence[${index}].amountSat must be a positive integer string`);
    }

    if (!isOutpoint(entry.outpoint)) {
      fail(`evidence[${index}].outpoint must be formatted as <txid>:<vout>`);
    } else {
      const outpointTxid = String(entry.outpoint).split(':')[0].toLowerCase();
      if (isRepeatedHexPlaceholder(outpointTxid)) {
        fail(`evidence[${index}].outpoint must not use a placeholder transaction id`);
      }
    }

    try {
      const url = new URL(entry.indexerUrl);
      if (url.protocol !== 'https:') {
        fail(`evidence[${index}].indexerUrl must use https`);
      }
    } catch {
      fail(`evidence[${index}].indexerUrl must be a valid URL`);
    }

    if (!isIsoUtcSecond(entry.timestamp)) {
      fail(`evidence[${index}].timestamp must be an ISO-8601 UTC second timestamp`);
    } else if (isFutureTimestamp(entry.timestamp)) {
      fail(`evidence[${index}].timestamp must not be in the future`);
    }

    if (!/^[0-9a-f]{40}$/i.test(String(entry.commit || ''))) {
      fail(`evidence[${index}].commit must be a 40-character git commit`);
    } else if (isRepeatedHexPlaceholder(entry.commit)) {
      fail(`evidence[${index}].commit must not be a placeholder git commit`);
    }
  });
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[bitcoin-broadcast-evidence][error] ${error}`);
  }
  process.exit(1);
}

console.log(`[bitcoin-broadcast-evidence] status=${manifest.status} releaseEnabled=${manifest.releaseEnabled} evidence=${manifest.evidence.length}`);
NODE
