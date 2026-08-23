#!/usr/bin/env bash

set -euo pipefail

# Reject Node preload/search-path injection before the first Node or npm process
# can start. The verifier is an evidence boundary, so it does not reinterpret or
# silently accept ambient runtime customization.
for unsafe_runtime_variable in NODE_OPTIONS NODE_PATH npm_config_node_options NPM_CONFIG_NODE_OPTIONS; do
  if [[ -n "${!unsafe_runtime_variable:-}" ]]; then
    printf 'Iroha JS candidate verification failed: unsafe runtime environment variable is set: %s\n' \
      "$unsafe_runtime_variable" >&2
    exit 1
  fi
done
unset NODE_OPTIONS NODE_PATH npm_config_node_options NPM_CONFIG_NODE_OPTIONS

# Use only system/package-manager locations selected by the repository owner;
# caller-prepended PATH entries must not replace git, node, npm, tar, or shasum.
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

# Ignore ambient Git routing, object, configuration, transport, and executable
# overrides before the first repository query. Replay never needs an external
# object database or transport.
unset \
  CDPATH \
  GIT_DIR \
  GIT_WORK_TREE \
  GIT_INDEX_FILE \
  GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_CONFIG \
  GIT_CONFIG_COUNT \
  GIT_CONFIG_PARAMETERS \
  GIT_CONFIG_GLOBAL \
  GIT_CONFIG_SYSTEM \
  GIT_EXEC_PATH \
  GIT_TEMPLATE_DIR \
  GIT_SSH \
  GIT_SSH_COMMAND \
  GIT_ASKPASS \
  SSH_ASKPASS \
  GIT_EXTERNAL_DIFF

ROOT_DIR="$(git rev-parse --show-toplevel)"
DEFAULT_BUNDLE_REL="artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f"
BUNDLE_DIR="$ROOT_DIR/$DEFAULT_BUNDLE_REL"
REPLAY_SOURCE=false
ADVERSARIAL_CORRUPT_REPACK_SIDECAR=false

EXPECTED_MANIFEST_SHA256="723c46192d369dac939f75d1ef1fb2f82456b3cd6afbd0ac51c0071383871a4d"
EXPECTED_PATCH_SHA256="b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049"
EXPECTED_TAR_SHA256="15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8"
EXPECTED_REPLAY_SUBSET_TREE="04fbf3b60512c7daf734d3f72c6a60ceb79316af"
CURRENT_POLICY_REJECTION_MARKER="index.d.ts must declare the exact 49-byte IVM V1 program header"
BASE_ARCHIVE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-base-source-archive.mjs"

fail() {
  printf 'Iroha JS candidate verification failed: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  scripts/verify-iroha-js-candidate.sh
  scripts/verify-iroha-js-candidate.sh --replay-source
  scripts/verify-iroha-js-candidate.sh --bundle-dir <path>

The default mode verifies the durable historical evidence, archive safety, and
exact digests without network access. It also proves that the superseded tar is
rejected by the current package policy; current-policy acceptance would be a
verification failure. --replay-source safely reconstructs the bounded
exact-base source set from the stored archive, applies the patch, verifies every
changed path, restores the stored generated checksum sidecar, and proves that
npm pack reproduces the exact stored tarball. It never consults a source
checkout or network service.
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --bundle-dir)
      [[ "$#" -ge 2 ]] || fail "--bundle-dir requires a path"
      BUNDLE_DIR="$2"
      shift 2
      ;;
    --replay-source)
      REPLAY_SOURCE=true
      shift
      ;;
    --adversarial-corrupt-repack-sidecar)
      ADVERSARIAL_CORRUPT_REPACK_SIDECAR=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [[ "$ADVERSARIAL_CORRUPT_REPACK_SIDECAR" == true ]]; then
  [[ "$REPLAY_SOURCE" == true ]] || fail "adversarial repack corruption requires --replay-source"
  [[ "$BUNDLE_DIR" != "$ROOT_DIR/$DEFAULT_BUNDLE_REL" ]] ||
    fail "adversarial repack corruption is forbidden for the canonical bundle"
fi

for command in node git tar shasum wc cmp mktemp npm awk; do
  command -v "$command" >/dev/null 2>&1 || fail "required command not found: $command"
done

assert_no_symlink_components() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const absolute = path.resolve(process.argv[2]);
const parsed = path.parse(absolute);
let current = parsed.root;
for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
  current = path.join(current, component);
  if (!fs.existsSync(current)) break;
  if (fs.lstatSync(current).isSymbolicLink()) {
    const resolved = fs.realpathSync(current);
    const macOsSystemAlias = ['/etc', '/tmp', '/var'].includes(current) && resolved === `/private${current}`;
    if (macOsSystemAlias) continue;
    throw new Error(`symlinked path component is forbidden: ${current}`);
  }
}
NODE
}

assert_no_symlink_components "$BUNDLE_DIR"
[[ -d "$BUNDLE_DIR" && ! -L "$BUNDLE_DIR" ]] || fail "bundle directory is missing or symlinked: $BUNDLE_DIR"
BUNDLE_DIR="$(cd "$BUNDLE_DIR" && pwd -P)"
MANIFEST="$BUNDLE_DIR/candidate.json"
PATCH="$BUNDLE_DIR/b423c0f8-to-final-candidate.patch"
TARBALL="$BUNDLE_DIR/iroha-iroha-js-0.0.3.tgz"
BASE_ARCHIVE="$BUNDLE_DIR/b423c0f8-iroha-js-candidate-replay-base.tar.gz"
BASE_INVENTORY="$BUNDLE_DIR/b423c0f8-iroha-js-candidate-replay-base.inventory.tsv"

for required in "$MANIFEST" "$PATCH" "$TARBALL" "$BASE_ARCHIVE" "$BASE_INVENTORY" "$BUNDLE_DIR/README.md"; do
  assert_no_symlink_components "$required"
  [[ -f "$required" && ! -L "$required" ]] || fail "required evidence file is missing, non-regular, or symlinked: $required"
  [[ "$(cd "$(dirname "$required")" && pwd -P)/$(basename "$required")" == "$BUNDLE_DIR/"* ]] ||
    fail "evidence file escapes the bundle: $required"
done
assert_no_symlink_components "$BASE_ARCHIVE_VERIFIER"
[[ -f "$BASE_ARCHIVE_VERIFIER" && ! -L "$BASE_ARCHIVE_VERIFIER" ]] ||
  fail "base source archive verifier is missing, non-regular, or symlinked: $BASE_ARCHIVE_VERIFIER"

node - "$MANIFEST" "$PATCH" "$TARBALL" "$BASE_ARCHIVE" "$BASE_INVENTORY" \
  "$EXPECTED_MANIFEST_SHA256" "$EXPECTED_PATCH_SHA256" "$EXPECTED_TAR_SHA256" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const [manifestPath, patchPath, tarPath, baseArchivePath, baseInventoryPath, expectedManifestSha, expectedPatchSha, expectedTarSha] =
  process.argv.slice(2);

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const manifestBytes = fs.readFileSync(manifestPath);
let manifest;
try {
  manifest = JSON.parse(manifestBytes.toString('utf8'));
} catch (error) {
  fail(`candidate manifest is invalid JSON: ${error.message}`);
}

assert(manifest.schemaVersion === 1, 'unexpected manifest schemaVersion');
assert(manifest.kind === 'unpublished-local-candidate-evidence', 'unexpected manifest kind');
assert(manifest.observedAt === '2026-07-12', 'unexpected observation date');
assert(manifest.source?.repository === 'https://github.com/hyperledger-iroha/iroha.git', 'unexpected source repository');
assert(manifest.source?.baseCommit === 'b423c0f8bcd317fd945d6f66ce3fa679401dba7f', 'unexpected source base commit');
assert(manifest.source?.baseTree === 'f5e47336c7ba64f43e629636fd0b0b31ca39a22e', 'unexpected source base tree');
assert(manifest.source?.observedBranch === 'optimizations', 'unexpected observed source branch');
assert(JSON.stringify(manifest.source?.baseArchive) === JSON.stringify({
  format: 'git-archive-tar-gzip',
  file: path.basename(baseArchivePath),
  sha256: 'cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c',
  bytes: 2412361,
  uncompressedBytes: 15319040,
  archiveEntries: 305,
  regularFiles: 285,
  directories: 20,
  payloadBytes: 15088177,
  globalPaxHeaders: 1,
  physicalHeaders: 306,
  inventoryFile: path.basename(baseInventoryPath),
  inventorySha256: '949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4',
  inventoryBytes: 35764,
  inventoryEntries: 305,
  metadataPath: '.fearless-iroha-js-replay-base.json',
  sourceCommit: 'b423c0f8bcd317fd945d6f66ce3fa679401dba7f',
  sourceTree: 'f5e47336c7ba64f43e629636fd0b0b31ca39a22e',
  reconstructedSubsetTree: '04fbf3b60512c7daf734d3f72c6a60ceb79316af',
  fullRepository: false,
  includedPaths: ['.gitignore', 'crates/iroha_js_host/src/lib.rs', 'javascript/iroha_js'],
  excludedPaths: ['javascript/iroha_js/node_modules'],
  maxCompressedBytes: 4194304,
  maxUncompressedBytes: 16777216,
  maxEntries: 512,
  maxFileBytes: 2097152,
}), 'unexpected bounded base source archive facts');

const patch = manifest.source?.patch;
assert(patch?.file === path.basename(patchPath), 'unexpected patch filename');
assert(patch?.sha256 === expectedPatchSha, 'unexpected pinned patch digest');
assert(patch?.bytes === 145949 && patch?.lines === 3351, 'unexpected patch dimensions');
assert(patch?.changedPaths === 32 && patch?.modifiedPaths === 28, 'unexpected patch changed/modified counts');
assert(patch?.addedPaths === 3 && patch?.deletedPaths === 1, 'unexpected patch add/delete counts');
assert(patch?.insertions === 2017 && patch?.deletions === 154, 'unexpected patch line statistics');
assert(patch?.relevantStateSha256 === '162e1cbbfbc1c8042075f2cb0439ea9827af0d69625a25328d2efb1686c5778c', 'unexpected relevant-state digest');

const expectedState = manifest.source?.expectedState;
assert(Array.isArray(expectedState) && expectedState.length === 32, 'expectedState must contain exactly 32 paths');
const expectedPaths = new Set();
for (const [index, entry] of expectedState.entries()) {
  const context = `expectedState[${index}]`;
  assert(entry && typeof entry === 'object' && !Array.isArray(entry), `${context} must be an object`);
  assert(typeof entry.path === 'string' && entry.path.length > 0, `${context}.path must be non-empty`);
  assert(!path.posix.isAbsolute(entry.path) && !entry.path.includes('\\') && !entry.path.split('/').includes('..'), `${context}.path is unsafe`);
  assert(!expectedPaths.has(entry.path), `${context}.path is duplicated`);
  expectedPaths.add(entry.path);
  if (entry.mode === 'DELETE') {
    assert(entry.bytes === null && entry.sha256 === null, `${context} deletion must use null bytes/digest`);
  } else {
    assert(entry.mode === '644', `${context}.mode must be 644 or DELETE`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `${context}.bytes is invalid`);
    assert(/^[0-9a-f]{64}$/u.test(entry.sha256), `${context}.sha256 is invalid`);
  }
}
const relevantState = `${expectedState.map((entry) =>
  `${entry.mode}\t${entry.bytes ?? '-'}\t${entry.sha256 ?? '-'}\t${entry.path}`).join('\n')}\n`;
assert(sha256(relevantState) === patch.relevantStateSha256, 'expectedState does not match relevant-state digest');

const artifact = manifest.artifact;
assert(artifact?.name === '@iroha/iroha-js' && artifact?.version === '0.0.3', 'unexpected package identity');
assert(artifact?.file === path.basename(tarPath), 'unexpected tar filename');
assert(artifact?.sha256 === expectedTarSha, 'unexpected pinned tar digest');
assert(artifact?.npmShasumSha1 === '8ee3a23653fc4e2648f81dc12ce5cf00d36b4439', 'unexpected npm SHA-1');
assert(artifact?.integrity === 'sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==', 'unexpected npm integrity');
assert(artifact?.packedBytes === 1281259 && artifact?.unpackedBytes === 7914958, 'unexpected package byte dimensions');
assert(artifact?.files === 154 && artifact?.archiveEntries === 154, 'unexpected package entry counts');
assert(artifact?.nativeAddons === 0, 'candidate must contain zero native addons');
assert(JSON.stringify(artifact?.generatedNativeChecksumSidecar) === JSON.stringify({
  path: 'package/native/iroha_js_host.checksums.json',
  bytes: 134,
  sha256: '72e7f471048d3ecdccfef4cd1acade1f24ba09aa6443bdf04c3b58d4561b0687',
  platform: 'darwin-arm64',
  referencedAddonSha256: '3e96ea2bb4e9df6ad3481c29bc1a02741b5108e5742ecbf36fa0ed4af2f988a1',
}), 'unexpected generated native checksum sidecar facts');

assert(JSON.stringify(manifest.replay) === JSON.stringify({
  sourcePatchAppliedToExactBase: true,
  sourcePatchReplayableFromBundledBaseArchive: true,
  baseSourceArchiveBundled: true,
  baseRepositoryBundled: false,
  offlineCandidateReplayable: true,
  offlineFullSourceReplayable: false,
  exactTarRepackVerified: true,
  exactTarRepackRequiresStoredGeneratedSidecar: true,
}), 'unexpected replay boundary');
assert(JSON.stringify(manifest.releaseBoundary) === JSON.stringify({
  evidenceVendored: true,
  ephemeral: false,
  published: false,
  reviewed: false,
  productionDependencyPinned: false,
  productionSourceIntegrated: false,
  releaseEnabled: false,
  realSafariScenarios: 0,
  realSafariAssertions: 0,
}), 'unexpected release boundary');

const patchBytes = fs.readFileSync(patchPath);
const patchText = patchBytes.toString('utf8');
const patchPaths = [];
for (const match of patchText.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)) {
  assert(match[1] === match[2], `patch renames or aliases a path: ${match[1]} -> ${match[2]}`);
  const candidate = match[1];
  assert(!path.posix.isAbsolute(candidate) && !candidate.includes('\\') && !candidate.split('/').includes('..'), `patch contains unsafe path: ${candidate}`);
  patchPaths.push(candidate);
}
assert(patchPaths.length === 32 && new Set(patchPaths).size === 32, 'patch must contain exactly 32 unique paths');
assert(JSON.stringify(patchPaths) === JSON.stringify(expectedState.map((entry) => entry.path)), 'patch path order/set differs from expectedState');
assert(!patchText.includes('/private/tmp/') && !patchText.includes('/Users/'), 'patch embeds an absolute local path');
assert(!patchText.includes('GIT binary patch'), 'patch must remain reviewable text');
assert(!/^new file mode 120000$/mu.test(patchText) && !/^old mode 120000$/mu.test(patchText), 'patch must not introduce symlinks');
assert(!/^new file mode 160000$/mu.test(patchText) && !/^old mode 160000$/mu.test(patchText), 'patch must not introduce submodules');

assert(sha256(manifestBytes) === expectedManifestSha, 'candidate manifest digest mismatch');
assert(sha256(patchBytes) === expectedPatchSha, 'candidate patch digest mismatch');
assert(patchBytes.byteLength === patch.bytes, 'candidate patch byte count mismatch');
assert(patchText.split('\n').length - 1 === patch.lines, 'candidate patch line count mismatch');
const tarBytes = fs.readFileSync(tarPath);
assert(sha256(tarBytes) === expectedTarSha, 'candidate tar digest mismatch');
assert(tarBytes.byteLength === artifact.packedBytes, 'candidate tar byte count mismatch');
NODE

# Parse and inventory-check the bounded base archive without using system tar.
# This rejects traversal, links, special files, duplicates, missing/extra files,
# metadata mismatches, and decompression beyond the pinned limits.
node "$BASE_ARCHIVE_VERIFIER" --manifest "$MANIFEST"

# The frozen 2026-07-12 candidate is preserved byte-for-byte, including its
# then-current 17-byte IVM declaration and 205/300 KiB browser caps. Those facts
# are honest historical evidence, but they must not satisfy today's hardened
# 49-byte/domain-separated/216/328 policy. Require the current checker to reject
# the exact tar for the pinned supersession reason; accepting it would silently
# upgrade historical evidence into release-candidate evidence.
set +e
current_policy_output="$(bash "$ROOT_DIR/scripts/check-iroha-js-sdk-artifact.sh" --tarball "$TARBALL" 2>&1)"
current_policy_status=$?
set -e
[[ "$current_policy_status" -ne 0 ]] ||
  fail "historical candidate unexpectedly satisfies current SDK policy"
[[ "$current_policy_output" == *"$CURRENT_POLICY_REJECTION_MARKER"* ]] ||
  fail "current SDK policy rejection changed: expected $CURRENT_POLICY_REJECTION_MARKER"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/fearless-iroha-candidate-verify.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/extracted"
tar -xzf "$TARBALL" -C "$tmp/extracted"

node - "$MANIFEST" "$tmp/extracted/package" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = process.argv[3];
let files = 0;
let bytes = 0;
function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`extracted package contains a symlink: ${absolute}`);
    if (stat.isDirectory()) walk(absolute);
    else if (stat.isFile()) {
      files += 1;
      bytes += stat.size;
    } else {
      throw new Error(`extracted package contains a special file: ${absolute}`);
    }
  }
}
walk(root);
if (files !== manifest.artifact.files || bytes !== manifest.artifact.unpackedBytes) {
  throw new Error(`extracted dimensions mismatch: files=${files}, bytes=${bytes}`);
}
const sidecar = manifest.artifact.generatedNativeChecksumSidecar;
const sidecarPath = path.join(path.dirname(root), sidecar.path);
const sidecarBytes = fs.readFileSync(sidecarPath);
const digest = crypto.createHash('sha256').update(sidecarBytes).digest('hex');
if (sidecarBytes.byteLength !== sidecar.bytes || digest !== sidecar.sha256) {
  throw new Error('generated native checksum sidecar bytes/digest mismatch');
}
const parsed = JSON.parse(sidecarBytes.toString('utf8'));
const expected = { entries: { 'darwin-arm64': { sha256: sidecar.referencedAddonSha256 } } };
if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
  throw new Error('generated native checksum sidecar content mismatch');
}
NODE

safe_git() {
  env \
    -u GIT_DIR \
    -u GIT_WORK_TREE \
    -u GIT_INDEX_FILE \
    -u GIT_OBJECT_DIRECTORY \
    -u GIT_ALTERNATE_OBJECT_DIRECTORIES \
    -u GIT_CONFIG \
    -u GIT_CONFIG_COUNT \
    -u GIT_CONFIG_PARAMETERS \
    -u GIT_CONFIG_GLOBAL \
    -u GIT_CONFIG_SYSTEM \
    -u GIT_SSH \
    -u GIT_SSH_COMMAND \
    -u GIT_ASKPASS \
    -u SSH_ASKPASS \
    -u GIT_EXTERNAL_DIFF \
    GIT_TERMINAL_PROMPT=0 \
    GIT_ASKPASS=/usr/bin/false \
    SSH_ASKPASS=/usr/bin/false \
    GIT_CONFIG_NOSYSTEM=1 \
    git \
      -c core.fsmonitor=false \
      -c core.hooksPath=/dev/null \
      -c core.askPass=/usr/bin/false \
      -c credential.helper= \
      -c credential.interactive=false \
      -c core.sshCommand=/usr/bin/false \
      -c protocol.file.allow=always \
      "$@"
}

numstat="$tmp/patch-numstat.tsv"
safe_git apply --numstat "$PATCH" > "$numstat"
node - "$MANIFEST" "$numstat" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const lines = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean);
let insertions = 0;
let deletions = 0;
const paths = [];
for (const line of lines) {
  const match = line.match(/^(\d+)\t(\d+)\t(.+)$/u);
  if (!match) throw new Error(`invalid patch numstat line: ${line}`);
  insertions += Number(match[1]);
  deletions += Number(match[2]);
  paths.push(match[3]);
}
if (insertions !== manifest.source.patch.insertions || deletions !== manifest.source.patch.deletions) {
  throw new Error(`patch numstat mismatch: +${insertions} -${deletions}`);
}
if (JSON.stringify(paths) !== JSON.stringify(manifest.source.expectedState.map((entry) => entry.path))) {
  throw new Error('patch numstat paths differ from expectedState');
}
NODE

printf '[iroha-js-candidate] offline historical evidence and current-policy rejection verification passed.\n'

if [[ "$REPLAY_SOURCE" != true ]]; then
  exit 0
fi

run_bounded() {
  local seconds="$1"
  shift
  node - "$seconds" "$@" <<'NODE'
const { spawn } = require('node:child_process');
const seconds = Number(process.argv[2]);
const command = process.argv[3];
const args = process.argv.slice(4);
if (!Number.isFinite(seconds) || seconds <= 0 || !command) process.exit(125);
const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 2000).unref();
}, seconds * 1000);
child.once('error', (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(125);
});
child.once('exit', (code, signal) => {
  clearTimeout(timer);
  if (timedOut) process.exit(124);
  if (signal) process.exit(128);
  process.exit(code ?? 125);
});
NODE
}

checkout="$tmp/replay"
# The dedicated parser creates this new directory itself and writes only the
# inventory-pinned regular files/directories after all archive checks pass.
node "$BASE_ARCHIVE_VERIFIER" --manifest "$MANIFEST" --extract "$checkout"
safe_git -C "$checkout" init --quiet
safe_git -C "$checkout" add -f -A
actual_replay_subset_tree="$(safe_git -C "$checkout" write-tree)"
[[ "$actual_replay_subset_tree" == "$EXPECTED_REPLAY_SUBSET_TREE" ]] ||
  fail "reconstructed replay subset tree mismatch: expected $EXPECTED_REPLAY_SUBSET_TREE, got $actual_replay_subset_tree"

safe_git -C "$checkout" apply --check "$PATCH"
safe_git -C "$checkout" apply "$PATCH"

node - "$MANIFEST" "$checkout" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = process.argv[3];
for (const entry of manifest.source.expectedState) {
  const absolute = path.join(root, entry.path);
  if (entry.mode === 'DELETE') {
    if (fs.existsSync(absolute)) throw new Error(`replay did not delete ${entry.path}`);
    continue;
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`replay path is not a regular file: ${entry.path}`);
  const mode = (stat.mode & 0o777).toString(8);
  const bytes = fs.readFileSync(absolute);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (mode !== entry.mode || bytes.byteLength !== entry.bytes || digest !== entry.sha256) {
    throw new Error(`replay state mismatch: ${entry.path}`);
  }
}
NODE

added_paths=(
  javascript/iroha_js/LICENSE
  javascript/iroha_js/test/kotodamaCompiler.native.test.js
  javascript/iroha_js/test/packageSurface.test.js
)
safe_git -C "$checkout" add --intent-to-add -- "${added_paths[@]}"
safe_git -C "$checkout" diff --no-ext-diff --no-textconv --check

replayed_paths="$tmp/replayed-paths.txt"
safe_git -C "$checkout" diff --no-ext-diff --no-textconv --name-only > "$replayed_paths"
node - "$MANIFEST" "$replayed_paths" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const actual = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean);
const expected = manifest.source.expectedState.map((entry) => entry.path).sort();
actual.sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('replay changed-path set differs from the pinned 32-path set');
}
NODE

# The patch intentionally deletes the generated sidecar. Restore the exact
# stored sidecar only for deterministic packaging; never restore the .node file.
sidecar_target="$checkout/javascript/iroha_js/native/iroha_js_host.checksums.json"
mkdir -p "$(dirname "$sidecar_target")"
tar -xzOf "$TARBALL" package/native/iroha_js_host.checksums.json > "$sidecar_target"
chmod 600 "$sidecar_target"
if [[ "$ADVERSARIAL_CORRUPT_REPACK_SIDECAR" == true ]]; then
  printf '\n' >> "$sidecar_target"
fi

repack_dir="$tmp/repack"
mkdir -p "$repack_dir" "$tmp/npm-home" "$tmp/npm-cache"
run_bounded 60 env \
  -i \
  PATH="$PATH" \
  HOME="$tmp/npm-home" \
  npm_config_userconfig="$tmp/npm-home/user.npmrc" \
  npm_config_globalconfig="$tmp/npm-home/global.npmrc" \
  npm_config_cache="$tmp/npm-cache" \
  npm_config_offline=true \
  npm_config_ignore_scripts=true \
  npm_config_audit=false \
  npm_config_fund=false \
  npm_config_update_notifier=false \
  npm pack "$checkout/javascript/iroha_js" --ignore-scripts --json \
  --pack-destination "$repack_dir" > "$tmp/repack.json"

repacked="$repack_dir/iroha-iroha-js-0.0.3.tgz"
[[ -f "$repacked" && ! -L "$repacked" ]] || fail "replay did not produce the expected tarball"
actual_repack_sha256="$(shasum -a 256 "$repacked" | awk '{print $1}')"
[[ "$actual_repack_sha256" == "$EXPECTED_TAR_SHA256" ]] ||
  fail "exact replay tar digest mismatch: expected $EXPECTED_TAR_SHA256, got $actual_repack_sha256"
cmp -s "$repacked" "$TARBALL" || fail "exact replay tar is not byte-identical"

printf '[iroha-js-candidate] exact source replay and byte-identical repack passed.\n'
