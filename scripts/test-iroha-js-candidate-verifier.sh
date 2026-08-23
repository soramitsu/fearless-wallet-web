#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-candidate.sh"
BASE_ARCHIVE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-base-source-archive.mjs"
CANONICAL_BUNDLE="$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f"
BASE_ARCHIVE_NAME="b423c0f8-iroha-js-candidate-replay-base.tar.gz"
BASE_INVENTORY_NAME="b423c0f8-iroha-js-candidate-replay-base.inventory.tsv"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fearless-iroha-candidate-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

passed=0

fail() {
  printf '[iroha-js-candidate-test][error] %s\n' "$*" >&2
  exit 1
}

fresh_fixture() {
  local name="$1"
  local destination="$TMP_DIR/$name"
  mkdir -p "$destination"
  cp "$CANONICAL_BUNDLE/README.md" "$destination/README.md"
  cp "$CANONICAL_BUNDLE/candidate.json" "$destination/candidate.json"
  cp "$CANONICAL_BUNDLE/b423c0f8-to-final-candidate.patch" "$destination/b423c0f8-to-final-candidate.patch"
  cp "$CANONICAL_BUNDLE/iroha-iroha-js-0.0.3.tgz" "$destination/iroha-iroha-js-0.0.3.tgz"
  cp "$CANONICAL_BUNDLE/$BASE_ARCHIVE_NAME" "$destination/$BASE_ARCHIVE_NAME"
  cp "$CANONICAL_BUNDLE/$BASE_INVENTORY_NAME" "$destination/$BASE_INVENTORY_NAME"
  printf '%s\n' "$destination"
}

expect_success() {
  local label="$1"
  shift
  local output
  if ! output="$("$@" 2>&1)"; then
    printf '%s\n' "$output" >&2
    fail "$label unexpectedly failed"
  fi
  passed=$((passed + 1))
}

expect_failure() {
  local label="$1"
  local expected="$2"
  shift 2
  local output status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label unexpectedly passed"
  if [[ -n "$expected" && "$output" != *"$expected"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label did not report expected marker: $expected"
  fi
  passed=$((passed + 1))
}

mutate_base_archive() {
  local fixture="$1"
  local mutation="$2"
  node - "$fixture/$BASE_ARCHIVE_NAME" "$fixture/candidate.json" "$mutation" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');

const [archivePath, manifestPath, mutation] = process.argv.slice(2);
let compressed = fs.readFileSync(archivePath);
let tar = zlib.gunzipSync(compressed);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baseArchive = manifest.source.baseArchive;

function octal(buffer, offset, length) {
  return Number.parseInt(buffer.subarray(offset, offset + length).toString('ascii').replace(/\0.*$/u, '').trim(), 8) || 0;
}

function text(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/u, '');
}

function entries(buffer) {
  const result = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return { result, terminator: offset };
    const size = octal(header, 124, 12);
    const prefix = text(header, 345, 155);
    const name = text(header, 0, 100);
    const archiveName = prefix ? `${prefix}/${name}` : name;
    const payload = offset + 512;
    const next = payload + Math.ceil(size / 512) * 512;
    result.push({ offset, payload, next, size, name: archiveName, type: String.fromCharCode(header[156] || 48) });
    offset = next;
  }
  throw new Error('fixture tar has no terminator');
}

function rewriteChecksum(header) {
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
}

function writeOctal(header, offset, length, value) {
  header.fill(0, offset, offset + length);
  header.write(value.toString(8).padStart(length - 1, '0'), offset, length - 1, 'ascii');
}

function newHeader(name) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, 0o664);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, 0);
  writeOctal(header, 136, 12, 0);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'binary');
  header.write('00', 263, 2, 'ascii');
  rewriteChecksum(header);
  return header;
}

function updateTransport({ updateUncompressed = true } = {}) {
  compressed = zlib.gzipSync(tar, { level: 9, mtime: 0 });
  fs.writeFileSync(archivePath, compressed);
  baseArchive.sha256 = crypto.createHash('sha256').update(compressed).digest('hex');
  baseArchive.bytes = compressed.length;
  if (updateUncompressed) baseArchive.uncompressedBytes = tar.length;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const scanned = entries(tar);
const find = (name) => {
  const entry = scanned.result.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`fixture entry not found: ${name}`);
  return entry;
};

switch (mutation) {
  case 'hash':
    compressed[compressed.length - 16] ^= 0x01;
    fs.writeFileSync(archivePath, compressed);
    break;
  case 'size':
    fs.appendFileSync(archivePath, Buffer.from([0]));
    break;
  case 'traversal': {
    const entry = find('.gitignore');
    const header = tar.subarray(entry.offset, entry.offset + 512);
    header.fill(0, 0, 100);
    header.fill(0, 345, 500);
    header.write('../escape', 0, 'utf8');
    rewriteChecksum(header);
    updateTransport();
    break;
  }
  case 'symlink': {
    const entry = find('.gitignore');
    const header = tar.subarray(entry.offset, entry.offset + 512);
    header[156] = '2'.charCodeAt(0);
    rewriteChecksum(header);
    updateTransport();
    break;
  }
  case 'extra': {
    newHeader('javascript/iroha_js/adversarial-extra').copy(tar, scanned.terminator);
    baseArchive.archiveEntries += 1;
    baseArchive.regularFiles += 1;
    baseArchive.physicalHeaders += 1;
    baseArchive.inventoryEntries += 1;
    updateTransport();
    break;
  }
  case 'missing': {
    const entry = find('.gitignore');
    tar.copy(tar, entry.offset, entry.next);
    tar.fill(0, tar.length - (entry.next - entry.offset));
    baseArchive.archiveEntries -= 1;
    baseArchive.regularFiles -= 1;
    baseArchive.payloadBytes -= entry.size;
    baseArchive.physicalHeaders -= 1;
    baseArchive.inventoryEntries -= 1;
    updateTransport();
    break;
  }
  case 'content': {
    const entry = find('.gitignore');
    tar[entry.payload] ^= 0x01;
    updateTransport();
    break;
  }
  case 'commit': {
    const entry = find('pax_global_header');
    const expected = Buffer.from('b423c0f8bcd317fd945d6f66ce3fa679401dba7f');
    const index = tar.indexOf(expected, entry.payload);
    if (index < entry.payload || index >= entry.payload + entry.size) throw new Error('commit marker missing');
    tar[index] = 'c'.charCodeAt(0);
    updateTransport();
    break;
  }
  case 'tree': {
    const entry = find('.fearless-iroha-js-replay-base.json');
    const expected = Buffer.from('f5e47336c7ba64f43e629636fd0b0b31ca39a22e');
    const index = tar.indexOf(expected, entry.payload);
    if (index < entry.payload || index >= entry.payload + entry.size) throw new Error('tree marker missing');
    tar[index] = 'e'.charCodeAt(0);
    updateTransport();
    break;
  }
  case 'decompression-bound':
    tar = Buffer.alloc(baseArchive.maxUncompressedBytes + 1);
    updateTransport({ updateUncompressed: false });
    break;
  default:
    throw new Error(`unknown archive fixture mutation: ${mutation}`);
}
NODE
}

expect_success "canonical historical evidence and current-policy rejection verification" bash "$VERIFIER"
expect_success "canonical historical source replay and exact repack" bash "$VERIFIER" --replay-source

fixture="$(fresh_fixture missing-base-archive)"
rm "$fixture/$BASE_ARCHIVE_NAME"
expect_failure "missing base source archive" "required evidence file is missing" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture missing-base-inventory)"
rm "$fixture/$BASE_INVENTORY_NAME"
expect_failure "missing base source inventory" "required evidence file is missing" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture symlink-base-archive)"
rm "$fixture/$BASE_ARCHIVE_NAME"
ln -s "$CANONICAL_BUNDLE/$BASE_ARCHIVE_NAME" "$fixture/$BASE_ARCHIVE_NAME"
expect_failure "symlinked base source archive" "symlinked path component is forbidden" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture base-archive-hash)"
mutate_base_archive "$fixture" hash
expect_failure "base source archive digest tamper" "base source archive digest mismatch" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-size)"
mutate_base_archive "$fixture" size
expect_failure "base source archive size tamper" "base source archive byte count mismatch" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-inventory-tamper)"
printf '# tamper\n' >> "$fixture/$BASE_INVENTORY_NAME"
expect_failure "base source inventory tamper" "base source inventory byte count mismatch" \
  bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture base-archive-traversal)"
mutate_base_archive "$fixture" traversal
expect_failure "base source archive path traversal" "unsafe segment" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-symlink-entry)"
mutate_base_archive "$fixture" symlink
expect_failure "base source archive symlink entry" "link or special-file entry" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-extra-file)"
mutate_base_archive "$fixture" extra
expect_failure "base source archive extra file" "exact file inventory" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-missing-file)"
mutate_base_archive "$fixture" missing
expect_failure "base source archive missing file" "exact file inventory" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-content-tamper)"
mutate_base_archive "$fixture" content
expect_failure "base source archive file-content tamper" "exact file inventory" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-commit-mismatch)"
mutate_base_archive "$fixture" commit
expect_failure "base source archive commit mismatch" "base source archive commit mismatch" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-tree-mismatch)"
mutate_base_archive "$fixture" tree
expect_failure "base source archive tree mismatch" "commit/tree metadata mismatch" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture base-archive-decompression-bound)"
mutate_base_archive "$fixture" decompression-bound
expect_failure "base source archive decompression bound" "decompression failed or exceeded its bounded output" \
  node "$BASE_ARCHIVE_VERIFIER" --manifest "$fixture/candidate.json"

fixture="$(fresh_fixture missing-tar)"
rm "$fixture/iroha-iroha-js-0.0.3.tgz"
expect_failure "missing tar" "required evidence file is missing" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture missing-patch)"
rm "$fixture/b423c0f8-to-final-candidate.patch"
expect_failure "missing patch" "required evidence file is missing" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture symlink-tar)"
rm "$fixture/iroha-iroha-js-0.0.3.tgz"
ln -s "$CANONICAL_BUNDLE/iroha-iroha-js-0.0.3.tgz" "$fixture/iroha-iroha-js-0.0.3.tgz"
expect_failure "symlinked tar" "symlinked path component is forbidden" bash "$VERIFIER" --bundle-dir "$fixture"

real_parent="$TMP_DIR/real-parent"
mkdir -p "$real_parent"
cp -R "$CANONICAL_BUNDLE" "$real_parent/bundle"
ln -s "$real_parent" "$TMP_DIR/symlink-parent"
expect_failure "symlinked bundle ancestor" "symlinked path component is forbidden" \
  bash "$VERIFIER" --bundle-dir "$TMP_DIR/symlink-parent/bundle"

fixture="$(fresh_fixture tar-tamper)"
printf 'trailing-tamper' >> "$fixture/iroha-iroha-js-0.0.3.tgz"
expect_failure "tar digest tamper" "candidate tar digest mismatch" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture patch-tamper)"
printf '\n# tamper\n' >> "$fixture/b423c0f8-to-final-candidate.patch"
expect_failure "patch digest tamper" "candidate patch digest mismatch" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture manifest-digest)"
printf '\n' >> "$fixture/candidate.json"
expect_failure "manifest digest tamper" "candidate manifest digest mismatch" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture false-release)"
node - "$fixture/candidate.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.releaseBoundary.releaseEnabled = true;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure "false release-enabled claim" "unexpected release boundary" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture false-review)"
node - "$fixture/candidate.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.releaseBoundary.reviewed = true;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure "false reviewed claim" "unexpected release boundary" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture stale-count)"
node - "$fixture/candidate.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.artifact.archiveEntries = 153;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure "stale archive count" "unexpected package entry counts" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture path-traversal)"
node - "$fixture/b423c0f8-to-final-candidate.patch" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, source.replace(
  'diff --git a/.gitignore b/.gitignore',
  'diff --git a/../escape b/../escape',
));
NODE
expect_failure "patch path traversal" "patch contains unsafe path" bash "$VERIFIER" --bundle-dir "$fixture"

fixture="$(fresh_fixture path-alias)"
node - "$fixture/b423c0f8-to-final-candidate.patch" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, source.replace(
  'diff --git a/.gitignore b/.gitignore',
  'diff --git a/.gitignore b/README.md',
));
NODE
expect_failure "patch path alias" "patch renames or aliases a path" bash "$VERIFIER" --bundle-dir "$fixture"

preload="$TMP_DIR/preload.mjs"
preload_marker="$TMP_DIR/preload-executed"
printf 'import fs from "node:fs"; fs.writeFileSync(process.env.IROHA_PRELOAD_MARKER, "executed");\n' > "$preload"
expect_failure "NODE_OPTIONS preload" "unsafe runtime environment variable is set: NODE_OPTIONS" \
  env IROHA_PRELOAD_MARKER="$preload_marker" NODE_OPTIONS="--import=$preload" bash "$VERIFIER"
[[ ! -e "$preload_marker" ]] || fail "NODE_OPTIONS preload executed before rejection"
passed=$((passed + 1))

expect_failure "npm node-options preload" "unsafe runtime environment variable is set: npm_config_node_options" \
  env IROHA_PRELOAD_MARKER="$preload_marker" npm_config_node_options="--import=$preload" bash "$VERIFIER"
[[ ! -e "$preload_marker" ]] || fail "npm node-options preload executed before rejection"
passed=$((passed + 1))

expect_failure "NODE_PATH injection" "unsafe runtime environment variable is set: NODE_PATH" \
  env NODE_PATH="$TMP_DIR/attacker-modules" bash "$VERIFIER"

fake_bin="$TMP_DIR/fake-bin"
path_marker="$TMP_DIR/path-hijack-executed"
mkdir -p "$fake_bin"
for tool in node npm git tar shasum; do
  printf '#!/bin/sh\nprintf invoked > "$IROHA_PATH_MARKER"\nexit 99\n' > "$fake_bin/$tool"
  chmod +x "$fake_bin/$tool"
done
expect_success "caller PATH hijack is ignored" env IROHA_PATH_MARKER="$path_marker" \
  PATH="$fake_bin:$PATH" bash "$VERIFIER"
[[ ! -e "$path_marker" ]] || fail "caller PATH replacement executed"
passed=$((passed + 1))

invalid_git_config="$TMP_DIR/invalid-git-config"
printf '[malformed\n' > "$invalid_git_config"
expect_success "ambient Git configuration and parameter injection is ignored" \
  env GIT_CONFIG="$invalid_git_config" GIT_CONFIG_PARAMETERS=malformed bash "$VERIFIER"

expect_failure "legacy live source argument is rejected" "unknown argument: --source-repo" \
  bash "$VERIFIER" --replay-source --source-repo /tmp/should-never-be-read

fixture="$(fresh_fixture repack-negative)"
expect_failure "corrupted generated sidecar changes exact offline repack" "exact replay tar digest mismatch" \
  bash "$VERIFIER" --bundle-dir "$fixture" --replay-source --adversarial-corrupt-repack-sidecar

expect_success "verifier contains no live checkout or fetch dependency" bash -c \
  '! grep -Eq "SOURCE_REPO|source-repo|/Users/.*/iroha|fetch --" "$1"' _ "$VERIFIER"

portable="$TMP_DIR/portable-replay-repository"
mkdir -p "$portable/scripts" "$portable/artifacts/iroha-js-candidate" "$portable/home"
cp "$VERIFIER" "$BASE_ARCHIVE_VERIFIER" "$ROOT_DIR/scripts/check-iroha-js-sdk-artifact.sh" "$portable/scripts/"
cp -R "$CANONICAL_BUNDLE" "$portable/artifacts/iroha-js-candidate/"
git -C "$portable" init --quiet
git -C "$portable" add -f scripts artifacts
expect_success "offline replay is portable outside both working repositories" \
  env HOME="$portable/home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
  bash -c 'cd "$1" && bash scripts/verify-iroha-js-candidate.sh --replay-source' _ "$portable"

expected_passed=40

[[ "$passed" -eq "$expected_passed" ]] ||
  fail "internal check inventory changed: expected $expected_passed, found $passed"
printf '[iroha-js-candidate-test] %d checks passed.\n' "$passed"
