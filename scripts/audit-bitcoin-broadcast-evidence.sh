#!/usr/bin/env bash
set -euo pipefail

SCRIPT_SOURCE="${BASH_SOURCE[0]}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_PARENT="${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_PARENT="." ;;
esac
ROOT_DIR="$(cd -P -- "$SCRIPT_PARENT/.." && pwd -P)"
EVIDENCE_FILE="$ROOT_DIR/scripts/bitcoin-testnet-broadcast-evidence.json"
REQUIRE_READY=false
SELFTEST_FIXTURE_ROOT=""
SELFTEST_INDEXER_RESPONSE=""

reject_ambient_override() {
  local name="$1"
  echo "[bitcoin-broadcast-evidence][error] $name is forbidden; production evidence inputs cannot be supplied through ambient environment overrides" >&2
  exit 1
}

[[ "${BITCOIN_BROADCAST_EVIDENCE_ROOT+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_ROOT
[[ "${BITCOIN_BROADCAST_EVIDENCE_COMMIT+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_COMMIT
[[ "${BITCOIN_BROADCAST_EVIDENCE_INDEXER_FIXTURE+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_INDEXER_FIXTURE
[[ "${BITCOIN_BROADCAST_EVIDENCE_CURL+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_CURL
[[ "${BITCOIN_BROADCAST_EVIDENCE_GIT+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_GIT
[[ "${BITCOIN_BROADCAST_EVIDENCE_NOW+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_NOW
[[ "${BITCOIN_BROADCAST_EVIDENCE_NODE+x}" != "x" ]] || reject_ambient_override BITCOIN_BROADCAST_EVIDENCE_NODE

usage() {
  cat <<'USAGE'
Usage: scripts/audit-bitcoin-broadcast-evidence.sh [--evidence <path>] [--require-ready]

Validates the web Bitcoin funded-testnet broadcast evidence manifest. The
default audit allows the current blocked state, but refuses any ready or release
claim unless funded testnet broadcast evidence is recorded.

The --selftest-fixture-root and --selftest-indexer-response options are reserved
for this script's isolated negative-test harness. Self-test output is never
production release evidence, and every self-test input must resolve beneath the
fixture root without symlinks.
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
    --selftest-fixture-root)
      [[ $# -ge 2 ]] || { echo "[bitcoin-broadcast-evidence][error] --selftest-fixture-root requires a path" >&2; exit 2; }
      SELFTEST_FIXTURE_ROOT="$2"
      shift 2
      ;;
    --selftest-indexer-response)
      [[ $# -ge 2 ]] || { echo "[bitcoin-broadcast-evidence][error] --selftest-indexer-response requires a path" >&2; exit 2; }
      SELFTEST_INDEXER_RESPONSE="$2"
      shift 2
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

NODE_BIN=""
for node_candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [[ -x "$node_candidate" ]]; then
    NODE_BIN="$node_candidate"
    break
  fi
done
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [[ "$NODE_BIN" != /* || ! -x "$NODE_BIN" ]]; then
  echo "[bitcoin-broadcast-evidence][error] node is required for structured JSON validation" >&2
  exit 1
fi

/usr/bin/env -i \
  HOME=/ \
  XDG_CONFIG_HOME=/ \
  PATH=/usr/bin:/bin \
  LANG=C \
  LC_ALL=C \
  "$NODE_BIN" - "$EVIDENCE_FILE" "$REQUIRE_READY" "$ROOT_DIR" "$SELFTEST_FIXTURE_ROOT" "$SELFTEST_INDEXER_RESPONSE" <<'NODE'
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder } = require('util');

const [evidenceFile, requireReadyRaw, rootDir, selftestFixtureRootRaw, selftestIndexerResponseRaw] = process.argv.slice(2);
const requireReady = requireReadyRaw === 'true';
const errors = [];
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORDING_DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
const MAX_RESPONSE_HEADERS_BYTES = 64 * 1024;
const CURL_BIN = '/usr/bin/curl';
const GIT_BIN = '/usr/bin/git';
const FORBIDDEN_AMBIENT_OVERRIDES = [
  'BITCOIN_BROADCAST_EVIDENCE_ROOT',
  'BITCOIN_BROADCAST_EVIDENCE_COMMIT',
  'BITCOIN_BROADCAST_EVIDENCE_INDEXER_FIXTURE',
  'BITCOIN_BROADCAST_EVIDENCE_CURL',
  'BITCOIN_BROADCAST_EVIDENCE_GIT',
  'BITCOIN_BROADCAST_EVIDENCE_NOW',
  'BITCOIN_BROADCAST_EVIDENCE_NODE'
];

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
const CANONICAL_TESTNET_INDEXER_URL = 'https://blockstream.info/testnet/api';
const CANONICAL_TESTNET_TRANSACTION_PREFIX = `${CANONICAL_TESTNET_INDEXER_URL}/tx/`;
const SECRET_VALUE_PATTERN =
  /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/u;

function fail(message) {
  errors.push(message);
}

for (const name of FORBIDDEN_AMBIENT_OVERRIDES) {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    fail(`${name} is forbidden; production evidence inputs cannot be supplied through ambient environment overrides`);
  }
}

const selftestMode = selftestFixtureRootRaw.length > 0 || selftestIndexerResponseRaw.length > 0;
let selftestRoot = null;
let auditedEvidenceFile = selftestMode ? null : evidenceFile;

if ((selftestFixtureRootRaw.length > 0) !== (selftestIndexerResponseRaw.length > 0)) {
  fail('--selftest-fixture-root and --selftest-indexer-response must be supplied together');
} else if (selftestMode) {
  try {
    if (!path.isAbsolute(selftestFixtureRootRaw)) {
      throw new Error('self-test fixture root must be an absolute path');
    }
    const rootStat = fs.lstatSync(selftestFixtureRootRaw);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('self-test fixture root must be a real directory, not a symlink');
    }
    selftestRoot = fs.realpathSync(selftestFixtureRootRaw);
  } catch (error) {
    fail(`invalid self-test fixture root: ${error.message}`);
  }
}

function isWithinSelftestRoot(candidate) {
  return Boolean(
    selftestRoot &&
    (candidate === selftestRoot || candidate.startsWith(`${selftestRoot}${path.sep}`))
  );
}

function resolveSelftestFile(file, label, { allowMissing = false } = {}) {
  if (!selftestRoot) return null;
  if (!path.isAbsolute(file)) {
    fail(`${label} must be an absolute path beneath the self-test fixture root`);
    return null;
  }

  const lexicalPath = path.resolve(file);
  if (!isWithinSelftestRoot(lexicalPath)) {
    fail(`${label} must remain beneath the self-test fixture root`);
    return null;
  }

  if (!fs.existsSync(lexicalPath)) {
    if (!allowMissing) fail(`${label} is missing: ${lexicalPath}`);
    return lexicalPath;
  }

  try {
    const stat = fs.lstatSync(lexicalPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${label} must be a regular file and must not be a symlink`);
      return null;
    }
    const realPath = fs.realpathSync(lexicalPath);
    if (!isWithinSelftestRoot(realPath)) {
      fail(`${label} resolved outside the self-test fixture root`);
      return null;
    }
    return realPath;
  } catch (error) {
    fail(`${label} could not be inspected: ${error.message}`);
    return null;
  }
}

let selftestNowMillis = null;
if (selftestMode && selftestRoot) {
  const evidenceFixturePath = resolveSelftestFile(evidenceFile, 'self-test evidence manifest', { allowMissing: true });
  if (evidenceFixturePath) auditedEvidenceFile = evidenceFixturePath;
  const currentTimeFile = resolveSelftestFile(
    path.join(selftestRoot, 'current-time.txt'),
    'self-test current-time fixture'
  );
  if (currentTimeFile) {
    const value = fs.readFileSync(currentTimeFile, 'utf8').trim();
    const parsedMillis = Date.parse(value);
    const canonicalValue = Number.isFinite(parsedMillis)
      ? new Date(parsedMillis).toISOString().replace('.000Z', 'Z')
      : null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || canonicalValue !== value) {
      fail('self-test current-time fixture must contain one ISO-8601 UTC second timestamp');
    } else {
      selftestNowMillis = parsedMillis;
    }
  }
  resolveSelftestFile(selftestIndexerResponseRaw, 'self-test indexer response');
}

const auditNowMillis = selftestNowMillis === null ? Date.now() : selftestNowMillis;

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

function isTemplatePlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized === 'todo' ||
    normalized === 'tbd' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'sample' ||
    normalized === 'example' ||
    normalized === 'dummy' ||
    normalized === 'placeholder' ||
    normalized === 'operator' ||
    normalized.startsWith('todo_') ||
    normalized.startsWith('todo-') ||
    normalized.includes('placeholder')
  );
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
  return parseIsoUtcSecondMillis(value) !== null;
}

function parseIsoUtcDateStartMillis(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const millis = Date.UTC(year, month - 1, day);
  const parsed = new Date(millis);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return millis;
}

function isFutureTimestamp(value) {
  const millis = parseIsoUtcSecondMillis(value);
  return Number.isFinite(millis) && millis > auditNowMillis + MAX_CLOCK_SKEW_MS;
}

function isFutureDateStart(millis) {
  return Number.isFinite(millis) && millis > auditNowMillis + MAX_CLOCK_SKEW_MS;
}

function parseIsoUtcSecondMillis(value) {
  const normalized = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(normalized)) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString().replace('.000Z', 'Z');
  return canonical === normalized ? millis : null;
}

function startOfUtcDate(millis) {
  const date = new Date(millis);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

function secretLikeValueReason(value, path = '$') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) {
      return `${path} must not contain secret-like token`;
    }
    return null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const reason = secretLikeValueReason(value[index], `${path}[${index}]`);
      if (reason) {
        return reason;
      }
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const reason = secretLikeValueReason(child, `${path}.${key}`);
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

function validatePublicOperator(value, path) {
  if (typeof value !== 'string') return;
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${path}: operator must be a single-line public value`);
  }
  if (SECRET_VALUE_PATTERN.test(value)) {
    fail(`${path}: operator must not contain secret-like token`);
  }
  if (isTemplatePlaceholder(value)) {
    fail(`${path}: operator must not be a placeholder operator`);
  }
}

function resolveCurrentReleaseCommit() {
  let commit = null;

  if (selftestMode) {
    const commitFile = resolveSelftestFile(
      path.join(selftestRoot || '', 'current-commit.txt'),
      'self-test current-commit fixture'
    );
    if (commitFile) commit = fs.readFileSync(commitFile, 'utf8').trim();
  } else {
    try {
      if (!fs.existsSync(GIT_BIN)) throw new Error(`${GIT_BIN} is missing`);
      commit = execFileSync(GIT_BIN, ['-C', rootDir, 'rev-parse', '--verify', 'HEAD^{commit}'], {
        encoding: 'utf8',
        env: sealedToolEnvironment('/'),
        maxBuffer: 4096,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000
      }).trim();
    } catch (error) {
      fail(`current release commit could not be resolved: ${error.message}`);
      return null;
    }
  }

  if (!/^[0-9a-f]{40}$/i.test(String(commit || ''))) {
    fail('current release commit must be a 40-character git commit');
    return null;
  }

  if (isRepeatedHexPlaceholder(commit)) {
    fail('current release commit must not be a placeholder git commit');
    return null;
  }

  return String(commit).toLowerCase();
}

function splitOutpoint(value) {
  const match = /^([0-9a-f]{64}):(\d+)$/i.exec(String(value || ''));
  if (!match) return null;
  return {
    txid: match[1].toLowerCase(),
    vout: Number(match[2])
  };
}

function sealedToolEnvironment(homeDir) {
  return {
    HOME: homeDir,
    XDG_CONFIG_HOME: homeDir,
    CURL_HOME: homeDir,
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    NO_PROXY: '*',
    no_proxy: '*',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0'
  };
}

function parseStrictUtf8Json(buffer, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function validateIndexerResponse(response, requestUrl, index) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    fail(`evidence[${index}] indexer transport response must be an object`);
    return null;
  }

  const allowedFields = new Set(['status', 'contentType', 'effectiveUrl', 'redirectCount', 'body']);
  for (const field of Object.keys(response)) {
    if (!allowedFields.has(field)) {
      fail(`evidence[${index}] indexer transport response contains unsupported field ${field}`);
    }
  }
  if (response.status !== 200) {
    fail(`evidence[${index}] indexer HTTP status must be exactly 200`);
  }
  if (response.contentType !== 'application/json') {
    fail(`evidence[${index}] indexer Content-Type must be exactly application/json`);
  }
  if (response.effectiveUrl !== requestUrl) {
    fail(`evidence[${index}] indexer effective URL must remain exactly ${requestUrl}`);
  }
  if (response.redirectCount !== 0) {
    fail(`evidence[${index}] indexer response must not follow redirects`);
  }

  let bodyBytes = Infinity;
  try {
    bodyBytes = Buffer.byteLength(JSON.stringify(response.body), 'utf8');
  } catch {
    // The size diagnostic below is intentionally fail closed.
  }
  if (bodyBytes > MAX_RESPONSE_BODY_BYTES) {
    fail(`evidence[${index}] indexer response body exceeds ${MAX_RESPONSE_BODY_BYTES} bytes`);
  }

  return response.body;
}

function loadSelftestIndexerResponse(requestUrl, index) {
  const fixtureFile = resolveSelftestFile(
    selftestIndexerResponseRaw,
    'self-test indexer response'
  );
  if (!fixtureFile) return null;

  try {
    const stat = fs.statSync(fixtureFile);
    if (stat.size > MAX_RESPONSE_BODY_BYTES + MAX_RESPONSE_HEADERS_BYTES) {
      fail(`self-test indexer response exceeds the bounded transport fixture size`);
      return null;
    }
    const response = parseStrictUtf8Json(fs.readFileSync(fixtureFile), 'self-test indexer response');
    return validateIndexerResponse(response, requestUrl, index);
  } catch (error) {
    fail(error.message);
    return null;
  }
}

function loadProductionIndexerResponse(requestUrl, index) {
  let tempDir = null;
  try {
    if (!fs.existsSync(CURL_BIN)) throw new Error(`${CURL_BIN} is missing`);
    tempDir = fs.mkdtempSync('/tmp/fearless-bitcoin-evidence-');
    const homeDir = path.join(tempDir, 'home');
    const bodyFile = path.join(tempDir, 'body');
    const headersFile = path.join(tempDir, 'headers');
    fs.mkdirSync(homeDir, { mode: 0o700 });

    const writeOut = execFileSync(CURL_BIN, [
      '--disable',
      '--silent',
      '--show-error',
      '--request', 'GET',
      '--proto', '=https',
      '--proto-redir', '=https',
      '--max-redirs', '0',
      '--connect-timeout', '5',
      '--max-time', '20',
      '--max-filesize', String(MAX_RESPONSE_BODY_BYTES),
      '--noproxy', '*',
      '--proxy', '',
      '--header', 'Accept: application/json',
      '--header', 'Cache-Control: no-cache',
      '--output', bodyFile,
      '--dump-header', headersFile,
      '--write-out', '%{http_code}\n%{url_effective}\n%{size_download}\n%{content_type}\n%{num_redirects}\n',
      requestUrl
    ], {
      encoding: 'utf8',
      env: sealedToolEnvironment(homeDir),
      maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 25000
    });

    const fields = writeOut.trimEnd().split('\n');
    if (fields.length !== 5) throw new Error('curl returned malformed transport metadata');
    const bodyStat = fs.statSync(bodyFile);
    const headersStat = fs.statSync(headersFile);
    const declaredBodyBytes = Number(fields[2]);
    if (
      bodyStat.size > MAX_RESPONSE_BODY_BYTES ||
      !Number.isSafeInteger(declaredBodyBytes) ||
      declaredBodyBytes !== bodyStat.size
    ) {
      throw new Error(`indexer response body exceeds or mismatches the ${MAX_RESPONSE_BODY_BYTES}-byte bound`);
    }
    if (headersStat.size > MAX_RESPONSE_HEADERS_BYTES) {
      throw new Error(`indexer response headers exceed the ${MAX_RESPONSE_HEADERS_BYTES}-byte bound`);
    }

    return validateIndexerResponse({
      status: Number(fields[0]),
      effectiveUrl: fields[1],
      contentType: fields[3],
      redirectCount: Number(fields[4]),
      body: parseStrictUtf8Json(fs.readFileSync(bodyFile), 'indexer response body')
    }, requestUrl, index);
  } catch (error) {
    fail(`evidence[${index}] txid could not be verified through the canonical Bitcoin indexer: ${error.message}`);
    return null;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function loadIndexerTransaction(entry, index) {
  const txid = String(entry.txid || '').toLowerCase();
  const requestUrl = `${CANONICAL_TESTNET_TRANSACTION_PREFIX}${txid}`;

  return selftestMode
    ? loadSelftestIndexerResponse(requestUrl, index)
    : loadProductionIndexerResponse(requestUrl, index);
}

function verifyBroadcastRecord(entry, index) {
  const errorCountBefore = errors.length;
  const transaction = loadIndexerTransaction(entry, index);
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
    fail(`evidence[${index}] indexer transaction response must be an object`);
    return false;
  }

  const txid = String(entry.txid || '').toLowerCase();
  if (String(transaction.txid || '').toLowerCase() !== txid) {
    fail(`evidence[${index}] indexer transaction txid does not match evidence txid`);
  }

  const amountSat = Number(entry.amountSat);
  const outputs = Array.isArray(transaction.vout) ? transaction.vout : [];
  const hasRecipientOutput = outputs.some((output) =>
    output &&
    output.scriptpubkey_address === entry.recipientAddress &&
    Number(output.value) === amountSat
  );
  if (!hasRecipientOutput) {
    fail(`evidence[${index}] indexer transaction missing recipient output ${entry.recipientAddress}:${entry.amountSat}`);
  }

  const outpoint = splitOutpoint(entry.outpoint);
  const inputs = Array.isArray(transaction.vin) ? transaction.vin : [];
  const matchingInputs = inputs.filter((input) =>
    input &&
    String(input.txid || '').toLowerCase() === outpoint.txid &&
    Number(input.vout) === outpoint.vout
  );
  if (matchingInputs.length === 0) {
    fail(`evidence[${index}] indexer transaction missing funding outpoint ${entry.outpoint}`);
    return false;
  }

  if (!matchingInputs.some((input) => input.prevout && input.prevout.scriptpubkey_address === entry.sourceAddress)) {
    fail(`evidence[${index}] funding outpoint source address does not match evidence sourceAddress`);
  }

  const status = transaction.status && typeof transaction.status === 'object' ? transaction.status : null;
  if (!status || status.confirmed !== true) {
    fail(`evidence[${index}] indexer transaction must be confirmed before ready evidence is accepted`);
    return false;
  }

  if (!Number.isSafeInteger(status.block_time) || status.block_time <= 0) {
    fail(`evidence[${index}] confirmed indexer transaction must include a positive block_time`);
    return false;
  }

  const evidenceTimestampMillis = parseIsoUtcSecondMillis(entry.timestamp);
  const blockTimeMillis = status.block_time * 1000;
  if (blockTimeMillis > auditNowMillis + MAX_CLOCK_SKEW_MS) {
    fail(`evidence[${index}] confirmed indexer transaction block_time must not be in the future`);
  }
  if (evidenceTimestampMillis !== null && evidenceTimestampMillis < blockTimeMillis) {
    fail(`evidence[${index}] timestamp must be at or after the confirmed transaction block_time`);
  } else if (
    evidenceTimestampMillis !== null &&
    evidenceTimestampMillis - blockTimeMillis > MAX_RECORDING_DELAY_MS
  ) {
    fail(`evidence[${index}] timestamp is too far after the confirmed transaction block_time`);
  }
  if (auditNowMillis - blockTimeMillis > MAX_EVIDENCE_AGE_MS) {
    fail(`evidence[${index}] confirmed indexer transaction is stale; release evidence must be at most 7 days old`);
  }

  return errors.length === errorCountBefore;
}

function validateReadyEnvelope(manifest, manifestBlockers, evidence, requireReady) {
  const readyClaimed = manifest.status === 'ready' || manifest.releaseEnabled || requireReady;
  if (!readyClaimed) return false;

  if (!manifest.releaseEnabled) {
    fail('releaseEnabled must be true when Bitcoin broadcast evidence is ready');
  }

  if (manifestBlockers.length > 0) {
    fail('blockers must be empty when Bitcoin broadcast evidence is ready');
  }

  if (evidence.length === 0) {
    fail('ready Bitcoin broadcast evidence requires at least one indexer-verified funded testnet broadcast record');
  }

  return true;
}

const manifest = auditedEvidenceFile ? readJson(auditedEvidenceFile) : null;

if (manifest) {
  requireObject(manifest, 'manifest');

  const secretLikePath = secretLikeKeyReason(manifest);
  if (secretLikePath) {
    fail(`${secretLikePath} must not be included in public Bitcoin broadcast evidence`);
  }
  const secretLikeValuePath = secretLikeValueReason(manifest);
  if (secretLikeValuePath) {
    fail(secretLikeValuePath);
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

  if (manifest.defaultIndexerUrl !== CANONICAL_TESTNET_INDEXER_URL) {
    fail('defaultIndexerUrl must be https://blockstream.info/testnet/api');
  }

  const lastReviewedStartMillis = parseIsoUtcDateStartMillis(manifest.lastReviewed);
  if (lastReviewedStartMillis === null) {
    fail('lastReviewed must be a YYYY-MM-DD UTC review date');
  } else if (isFutureDateStart(lastReviewedStartMillis)) {
    fail('lastReviewed must not be in the future');
  }

  const manifestBlockers = requireArray(manifest.blockers, 'blockers');
  const blockers = new Set(manifestBlockers);
  const envVars = new Set(requireArray(manifest.liveSmokeEnvironment, 'liveSmokeEnvironment'));
  const commandList = requireArray(manifest.readyVerificationCommands, 'readyVerificationCommands');
  const commands = commandList.join('\n');
  const requiredEvidenceFieldList = requireArray(manifest.requiredEvidenceFields, 'requiredEvidenceFields');
  const requiredEvidenceFields = new Set(requiredEvidenceFieldList);
  const evidence = requireArray(manifest.evidence, 'evidence');

  if (new Set(commandList).size !== commandList.length) {
    fail('duplicate Bitcoin broadcast evidence verification command');
  }
  if (requiredEvidenceFields.size !== requiredEvidenceFieldList.length) {
    fail('duplicate Bitcoin broadcast evidence required field');
  }

  if (manifest.status === 'blocked') {
    if (evidence.length !== 0) {
      fail('blocked Bitcoin broadcast evidence must not contain evidence records');
    }
    for (const blocker of REQUIRED_BLOCKERS) {
      if (!blockers.has(blocker)) {
        fail(`blocked evidence missing blocker ${blocker}`);
      }
    }
    for (const blocker of manifestBlockers) {
      if (!REQUIRED_BLOCKERS.includes(blocker)) {
        fail(`unsupported Bitcoin broadcast evidence blocker: ${blocker}`);
      }
    }
    if (blockers.size !== manifestBlockers.length) {
      fail('duplicate Bitcoin broadcast evidence blocker');
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

  const readyClaimed = validateReadyEnvelope(manifest, manifestBlockers, evidence, requireReady);

  const seenTxids = new Set();
  let latestEvidenceDateStartMillis = null;
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

    validatePublicOperator(entry.operator, `evidence[${index}].operator`);

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
      if (url.protocol !== 'https:') fail(`evidence[${index}].indexerUrl must use https`);
    } catch {
      fail(`evidence[${index}].indexerUrl must be a valid URL`);
    }
    if (entry.indexerUrl !== CANONICAL_TESTNET_INDEXER_URL) {
      fail(`evidence[${index}].indexerUrl must be exactly the reviewed origin and path ${CANONICAL_TESTNET_INDEXER_URL}`);
    }

    if (!isIsoUtcSecond(entry.timestamp)) {
      fail(`evidence[${index}].timestamp must be an ISO-8601 UTC second timestamp`);
    } else if (isFutureTimestamp(entry.timestamp)) {
      fail(`evidence[${index}].timestamp must not be in the future`);
    } else {
      const timestampMillis = parseIsoUtcSecondMillis(entry.timestamp);
      if (timestampMillis !== null) {
        if (readyClaimed && auditNowMillis - timestampMillis > MAX_EVIDENCE_AGE_MS) {
          fail(`evidence[${index}].timestamp is stale; release evidence must be at most 7 days old`);
        }
        latestEvidenceDateStartMillis = Math.max(
          latestEvidenceDateStartMillis || 0,
          startOfUtcDate(timestampMillis)
        );
      }
    }

    if (!/^[0-9a-f]{40}$/i.test(String(entry.commit || ''))) {
      fail(`evidence[${index}].commit must be a 40-character git commit`);
    } else if (isRepeatedHexPlaceholder(entry.commit)) {
      fail(`evidence[${index}].commit must not be a placeholder git commit`);
    }
  });

  if (
    readyClaimed &&
    latestEvidenceDateStartMillis !== null &&
    lastReviewedStartMillis !== null &&
    lastReviewedStartMillis < latestEvidenceDateStartMillis
  ) {
    fail('lastReviewed must be on or after the latest evidence timestamp date');
  }

  const currentReleaseCommit = readyClaimed ? resolveCurrentReleaseCommit() : null;
  if (readyClaimed && errors.length === 0) {
    let verifiedCurrentCommitRecords = 0;
    evidence.forEach((entry, index) => {
      const verified = verifyBroadcastRecord(entry, index);
      if (verified && currentReleaseCommit && String(entry.commit || '').toLowerCase() === currentReleaseCommit) {
        verifiedCurrentCommitRecords += 1;
      }
    });

    if (currentReleaseCommit && verifiedCurrentCommitRecords === 0) {
      fail(`ready Bitcoin broadcast evidence requires at least one indexer-verified funded testnet broadcast record for current release commit ${currentReleaseCommit}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[bitcoin-broadcast-evidence][error] ${error}`);
  }
  process.exit(1);
}

console.log(`[bitcoin-broadcast-evidence] status=${manifest.status} releaseEnabled=${manifest.releaseEnabled} evidence=${manifest.evidence.length} mode=${selftestMode ? 'selftest-not-release-evidence' : 'production'}`);
NODE
