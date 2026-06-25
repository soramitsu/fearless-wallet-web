#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

fail() {
  printf 'Iroha JS SDK artifact check failed: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  scripts/check-iroha-js-sdk-artifact.sh --self-test
  scripts/check-iroha-js-sdk-artifact.sh --tarball <path>
  scripts/check-iroha-js-sdk-artifact.sh --package-dir <path>
  scripts/check-iroha-js-sdk-artifact.sh --download --version <version> [--registry <url>]
  scripts/check-iroha-js-sdk-artifact.sh --github-release --repo <owner/repo> --tag <tag> --asset <name> [--sha256 <hex>]

Validates that an @iroha/iroha-js package artifact contains the browser-safe SDK
surface required by fearless-wallet-web and does not package the native .node
addon into the browser extension dependency path.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

make_tmp() {
  mktemp -d "${TMPDIR:-/tmp}/fearless-iroha-js-sdk.XXXXXX"
}

validate_tarball() {
  local tarball="$1"
  [[ -f "$tarball" ]] || fail "tarball not found: $tarball"

  local entries
  entries="$(tar -tzf "$tarball")" || fail "unable to list tarball: $tarball"

  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    [[ "$entry" != /* ]] || fail "tarball contains absolute path: $entry"
    [[ "$entry" != *'\'* ]] || fail "tarball contains backslash path: $entry"
    [[ ! "$entry" =~ (^|/)\.\.($|/) ]] || fail "tarball contains parent path segment: $entry"
    [[ "$entry" == package || "$entry" == package/* ]] || fail "tarball entry is outside package/: $entry"
  done <<<"$entries"

  local tmp
  tmp="$(make_tmp)"
  trap_add_rm "$tmp"
  tar -xzf "$tarball" -C "$tmp" || fail "unable to extract tarball: $tarball"
  validate_package_dir "$tmp/package"
}

validate_package_dir() {
  local package_dir="$1"
  [[ -d "$package_dir" ]] || fail "package directory not found: $package_dir"

  node - "$package_dir" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];

function fail(message) {
  throw new Error(message);
}

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`missing required file: ${rel}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function expectContains(rel, needle) {
  const text = read(rel);
  if (!text.includes(needle)) {
    fail(`${rel} must contain ${needle}`);
  }
}

function expectExport(pkg, key, target) {
  const entry = pkg.exports?.[key];
  if (!entry) fail(`package.json exports missing ${key}`);
  const values = typeof entry === 'string' ? [entry] : Object.values(entry);
  if (!values.includes(target)) {
    fail(`package.json exports ${key} must reference ${target}`);
  }
}

const pkg = JSON.parse(read('package.json'));
if (pkg.name !== '@iroha/iroha-js') fail('package.json name must be @iroha/iroha-js');
if (pkg.type !== 'module') fail('package.json type must be module');
if (pkg.license !== 'Apache-2.0') fail('package.json license must be Apache-2.0');
if (pkg.private === true) fail('package.json private must not be true');

expectExport(pkg, '.', './dist/index.js');
expectExport(pkg, './browser', './dist/browser.js');
expectExport(pkg, './torii-browser', './dist/toriiBrowserClient.js');
expectExport(pkg, './crypto', './dist/crypto.browser.js');
expectExport(pkg, './instruction-builders', './dist/instructionBuilders.js');
expectExport(pkg, './nexus-app', './dist/nexusApp.js');

if (pkg.browser?.['./dist/crypto.js'] !== './dist/crypto.browser.js') {
  fail('package.json browser map must replace ./dist/crypto.js');
}
if (pkg.browser?.['./dist/native.js'] !== './dist/native.browser.js') {
  fail('package.json browser map must replace ./dist/native.js');
}
if (pkg.exports?.['./nexus-app']?.browser !== './dist/nexusApp.js') {
  fail('package.json exports ./nexus-app must include browser ./dist/nexusApp.js');
}

[
  'index.d.ts',
  'connect.browser.d.ts',
  'nexus-app.d.ts',
  'dist/index.js',
  'dist/browser.js',
  'dist/toriiBrowserClient.js',
  'dist/crypto.browser.js',
  'dist/native.browser.js',
  'dist/instructionBuilders.js',
  'dist/transaction.js',
  'dist/norito.js',
  'dist/address.js',
  'dist/nexusApp.js',
].forEach(read);

expectContains('index.d.ts', 'SignedTransactionResult');
expectContains('index.d.ts', 'buildTransferAssetInstruction');
expectContains('index.d.ts', 'ToriiClient');
expectContains('nexus-app.d.ts', 'NexusTransactionCodec');
expectContains('nexus-app.d.ts', 'NexusAppClient');
expectContains('nexus-app.d.ts', 'finalizeSignedTransaction');
expectContains('connect.browser.d.ts', 'signTransaction');
expectContains('dist/browser.js', 'buildTransferAssetInstruction');
expectContains('dist/browser.js', 'ToriiBrowserClient');
expectContains('dist/nexusApp.js', 'NexusAppClient');
expectContains('dist/nexusApp.js', 'finalizeSignedTransaction');
expectContains('dist/native.browser.js', 'iroha_js_host is unavailable in browser builds');

if (exists('native/iroha_js_host.node')) {
  fail('browser package must not include native/iroha_js_host.node');
}
NODE
}

pack_package_dir() {
  local package_dir="$1"
  [[ -d "$package_dir" ]] || fail "package directory not found: $package_dir"
  require_command npm

  local tmp pack_json filename
  tmp="$(make_tmp)"
  trap_add_rm "$tmp"
  pack_json="$(npm pack "$package_dir" --json --pack-destination "$tmp")" ||
    fail "npm pack failed for $package_dir"
  filename="$(printf '%s\n' "$pack_json" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(input);
  const item = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  if (!item || !item.filename) process.exit(2);
  process.stdout.write(item.filename);
});
')" || fail "npm pack output did not include filename"

  validate_tarball "$tmp/$filename"
}

download_package() {
  local version="$1"
  local registry="$2"
  require_command npm

  [[ -n "$version" ]] || fail "--version is required with --download"

  local tmp pack_json filename
  tmp="$(make_tmp)"
  trap_add_rm "$tmp"
  pack_json="$(npm pack "@iroha/iroha-js@$version" --json --pack-destination "$tmp" --registry "$registry")" ||
    fail "npm pack download failed for @iroha/iroha-js@$version"
  filename="$(printf '%s\n' "$pack_json" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(input);
  const item = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  if (!item || !item.filename) process.exit(2);
  process.stdout.write(item.filename);
});
')" || fail "npm pack output did not include filename"

  validate_tarball "$tmp/$filename"
}

download_github_release_asset() {
  local repo="$1"
  local tag="$2"
  local asset="$3"
  local expected_sha256="$4"

  [[ -n "$repo" ]] || fail "--repo is required with --github-release"
  [[ -n "$tag" ]] || fail "--tag is required with --github-release"
  [[ -n "$asset" ]] || fail "--asset is required with --github-release"

  local normalized_sha256="${expected_sha256#sha256:}"
  normalized_sha256="$(printf '%s' "$normalized_sha256" | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$normalized_sha256" && ! "$normalized_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    fail "--sha256 must be a 64-character hex digest"
  fi

  require_command gh

  local tmp
  tmp="$(make_tmp)"
  trap_add_rm "$tmp"
  gh release download "$tag" --repo "$repo" --pattern "$asset" --dir "$tmp" --clobber ||
    fail "GitHub release asset download failed for $repo@$tag:$asset"

  local downloaded_files=()
  while IFS= read -r -d '' file; do
    downloaded_files+=("$file")
  done < <(find "$tmp" -maxdepth 1 -type f -print0)

  if [[ "${#downloaded_files[@]}" -ne 1 ]]; then
    fail "GitHub release download must produce exactly one asset, found ${#downloaded_files[@]}"
  fi

  local downloaded="${downloaded_files[0]}"
  if [[ "$(basename "$downloaded")" != "$asset" ]]; then
    fail "GitHub release asset name mismatch: expected $asset, got $(basename "$downloaded")"
  fi

  if [[ -n "$normalized_sha256" ]]; then
    require_command shasum
    local actual_sha256
    actual_sha256="$(shasum -a 256 "$downloaded" | awk '{print $1}')" ||
      fail "unable to compute SHA-256 for $downloaded"
    if [[ "$actual_sha256" != "$normalized_sha256" ]]; then
      fail "GitHub release asset SHA-256 mismatch: expected $normalized_sha256, got $actual_sha256"
    fi
  fi

  validate_tarball "$downloaded"
}

TRAP_RM_DIRS=()
trap_add_rm() {
  TRAP_RM_DIRS+=("$1")
}

cleanup() {
  local dir
  for dir in "${TRAP_RM_DIRS[@]}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

expect_self_test_failure() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "self-test expected failure did not fail: $label"
  fi
}

write_fixture_package() {
  local dir="$1"
  mkdir -p "$dir/package/dist" "$dir/package/native"
  cat > "$dir/package/package.json" <<'JSON'
{
  "name": "@iroha/iroha-js",
  "version": "0.0.0-self-test",
  "type": "module",
  "license": "Apache-2.0",
  "private": false,
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./index.d.ts" },
    "./browser": { "browser": "./dist/browser.js", "import": "./dist/browser.js", "types": "./index.d.ts" },
    "./torii-browser": { "browser": "./dist/toriiBrowserClient.js", "import": "./dist/toriiBrowserClient.js", "types": "./index.d.ts" },
    "./crypto": { "browser": "./dist/crypto.browser.js", "import": "./dist/crypto.js", "types": "./index.d.ts" },
    "./instruction-builders": { "import": "./dist/instructionBuilders.js", "types": "./index.d.ts" },
    "./nexus-app": { "browser": "./dist/nexusApp.js", "import": "./dist/nexusApp.js", "types": "./nexus-app.d.ts" }
  },
  "browser": {
    "./dist/crypto.js": "./dist/crypto.browser.js",
    "./dist/native.js": "./dist/native.browser.js"
  }
}
JSON
  printf 'export interface SignedTransactionResult {}\nexport function buildTransferAssetInstruction(): void;\nexport class ToriiClient {}\n' > "$dir/package/index.d.ts"
  printf 'export interface BrowserConnectWallet { signTransaction(): Promise<Uint8Array>; }\n' > "$dir/package/connect.browser.d.ts"
  printf 'export interface NexusTransactionCodec { finalizeSignedTransaction(): void; }\nexport class NexusAppClient {}\n' > "$dir/package/nexus-app.d.ts"
  printf 'export { buildTransferAssetInstruction } from "./instructionBuilders.js";\nexport { ToriiBrowserClient } from "./toriiBrowserClient.js";\n' > "$dir/package/dist/browser.js"
  printf 'export function getNativeBinding() { throw new Error("iroha_js_host is unavailable in browser builds."); }\n' > "$dir/package/dist/native.browser.js"
  for file in index toriiBrowserClient crypto.browser instructionBuilders transaction norito address; do
    printf 'export const marker = "%s";\n' "$file" > "$dir/package/dist/$file.js"
  done
  printf 'export class NexusAppClient {}\nexport function finalizeSignedTransaction() {}\n' > "$dir/package/dist/nexusApp.js"
}

make_fixture_tarball() {
  local src="$1"
  local out="$2"
  tar -czf "$out" -C "$src" package
}

self_test() {
  require_command node
  require_command tar

  local tmp
  tmp="$(make_tmp)"
  trap_add_rm "$tmp"
  write_fixture_package "$tmp/valid"
  make_fixture_tarball "$tmp/valid" "$tmp/valid.tgz"
  validate_tarball "$tmp/valid.tgz"

  cp -R "$tmp/valid" "$tmp/missing-browser-stub"
  rm "$tmp/missing-browser-stub/package/dist/native.browser.js"
  make_fixture_tarball "$tmp/missing-browser-stub" "$tmp/missing-browser-stub.tgz"
  expect_self_test_failure "missing browser native stub" validate_tarball "$tmp/missing-browser-stub.tgz"

  cp -R "$tmp/valid" "$tmp/native-addon"
  printf 'native' > "$tmp/native-addon/package/native/iroha_js_host.node"
  make_fixture_tarball "$tmp/native-addon" "$tmp/native-addon.tgz"
  expect_self_test_failure "native addon packaged" validate_tarball "$tmp/native-addon.tgz"

  cp -R "$tmp/valid" "$tmp/missing-export"
  node - "$tmp/missing-export/package/package.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pkg.exports['./browser'];
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  make_fixture_tarball "$tmp/missing-export" "$tmp/missing-export.tgz"
  expect_self_test_failure "missing browser export" validate_tarball "$tmp/missing-export.tgz"

  cp -R "$tmp/valid" "$tmp/missing-nexus-browser-export"
  node - "$tmp/missing-nexus-browser-export/package/package.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pkg.exports['./nexus-app'].browser;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  make_fixture_tarball "$tmp/missing-nexus-browser-export" "$tmp/missing-nexus-browser-export.tgz"
  expect_self_test_failure "missing nexus browser export" validate_tarball "$tmp/missing-nexus-browser-export.tgz"

  cp -R "$tmp/valid" "$tmp/missing-nexus-finalizer"
  printf 'export interface NexusTransactionCodec {}\nexport class NexusAppClient {}\n' > \
    "$tmp/missing-nexus-finalizer/package/nexus-app.d.ts"
  make_fixture_tarball "$tmp/missing-nexus-finalizer" "$tmp/missing-nexus-finalizer.tgz"
  expect_self_test_failure "missing nexus finalizer declaration" validate_tarball "$tmp/missing-nexus-finalizer.tgz"

  printf 'Iroha JS SDK artifact self-test passed.\n'
}

MODE=""
TARBALL=""
PACKAGE_DIR=""
VERSION=""
REGISTRY="https://registry.npmjs.org/"
RELEASE_REPO=""
RELEASE_TAG=""
RELEASE_ASSET=""
RELEASE_SHA256=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test)
      MODE="self-test"
      shift
      ;;
    --tarball)
      MODE="tarball"
      TARBALL="${2:-}"
      [[ -n "$TARBALL" ]] || fail "--tarball requires a path"
      shift 2
      ;;
    --package-dir)
      MODE="package-dir"
      PACKAGE_DIR="${2:-}"
      [[ -n "$PACKAGE_DIR" ]] || fail "--package-dir requires a path"
      shift 2
      ;;
    --download)
      MODE="download"
      shift
      ;;
    --github-release)
      MODE="github-release"
      shift
      ;;
    --version)
      VERSION="${2:-}"
      [[ -n "$VERSION" ]] || fail "--version requires a value"
      shift 2
      ;;
    --registry)
      REGISTRY="${2:-}"
      [[ -n "$REGISTRY" ]] || fail "--registry requires a value"
      shift 2
      ;;
    --repo)
      RELEASE_REPO="${2:-}"
      [[ -n "$RELEASE_REPO" ]] || fail "--repo requires a value"
      shift 2
      ;;
    --tag)
      RELEASE_TAG="${2:-}"
      [[ -n "$RELEASE_TAG" ]] || fail "--tag requires a value"
      shift 2
      ;;
    --asset)
      RELEASE_ASSET="${2:-}"
      [[ -n "$RELEASE_ASSET" ]] || fail "--asset requires a value"
      shift 2
      ;;
    --sha256)
      RELEASE_SHA256="${2:-}"
      [[ -n "$RELEASE_SHA256" ]] || fail "--sha256 requires a value"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
done

require_command node
require_command tar

case "$MODE" in
  self-test)
    self_test
    ;;
  tarball)
    validate_tarball "$TARBALL"
    printf 'Iroha JS SDK artifact check passed for %s.\n' "$TARBALL"
    ;;
  package-dir)
    pack_package_dir "$PACKAGE_DIR"
    printf 'Iroha JS SDK artifact check passed for package directory %s.\n' "$PACKAGE_DIR"
    ;;
  download)
    download_package "$VERSION" "$REGISTRY"
    printf 'Iroha JS SDK artifact check passed for @iroha/iroha-js@%s.\n' "$VERSION"
    ;;
  github-release)
    download_github_release_asset "$RELEASE_REPO" "$RELEASE_TAG" "$RELEASE_ASSET" "$RELEASE_SHA256"
    printf 'Iroha JS SDK artifact check passed for GitHub release %s@%s asset %s.\n' "$RELEASE_REPO" "$RELEASE_TAG" "$RELEASE_ASSET"
    ;;
  *)
    usage >&2
    fail "choose one of --self-test, --tarball, --package-dir, --download, or --github-release"
    ;;
esac
