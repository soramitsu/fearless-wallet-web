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

  local archive_bytes
  archive_bytes="$(wc -c < "$tarball" | tr -d '[:space:]')"
  [[ "$archive_bytes" =~ ^[0-9]+$ && "$archive_bytes" -le 67108864 ]] ||
    fail "tarball exceeds the 64 MiB review limit: $tarball"

  local entries
  entries="$(tar -tzf "$tarball")" || fail "unable to list tarball: $tarball"

  local entry_count duplicate_entries unsafe_entry_types
  entry_count="$(printf '%s\n' "$entries" | awk 'NF { count += 1 } END { print count + 0 }')"
  [[ "$entry_count" -gt 0 && "$entry_count" -le 4096 ]] ||
    fail "tarball entry count must be between 1 and 4096, got $entry_count"
  duplicate_entries="$(printf '%s\n' "$entries" | LC_ALL=C sort | uniq -d)"
  [[ -z "$duplicate_entries" ]] || fail "tarball contains duplicate entries: $duplicate_entries"
  unsafe_entry_types="$(tar -tvzf "$tarball" | awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { print }')"
  [[ -z "$unsafe_entry_types" ]] || fail "tarball contains links or special-file entries: $unsafe_entry_types"

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
const vm = require('node:vm');

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

let inspectedFileCount = 0;
let inspectedBytes = 0;
function inspectTree(current, relative = '') {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(current, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`package must not contain symbolic links: ${rel}`);
    if (stat.isDirectory()) {
      inspectTree(absolute, rel);
    } else if (!stat.isFile()) {
      fail(`package must contain only regular files and directories: ${rel}`);
    } else if (rel.endsWith('.node')) {
      fail(`browser package must not include native Node addons: ${rel}`);
    } else {
      inspectedFileCount += 1;
      inspectedBytes += stat.size;
      if (stat.size > 16 * 1024 * 1024) fail(`package file exceeds 16 MiB: ${rel}`);
    }
  }
}

function expectContains(rel, needle) {
  const text = read(rel);
  if (!text.includes(needle)) {
    fail(`${rel} must contain ${needle}`);
  }
}

function expectExactIvmHeaderLength(rel, syntax) {
  const source = read(rel);
  const pattern = syntax === 'declaration'
    ? /^\s*export\s+const\s+IVM_PROGRAM_HEADER_LENGTH\s*:\s*(\d+)\s*;\s*$/gmu
    : /^\s*export\s+const\s+IVM_PROGRAM_HEADER_LENGTH\s*=\s*(\d+)\s*;\s*$/gmu;
  const values = [...source.matchAll(pattern)].map((match) => match[1]);
  if (values.length !== 1 || values[0] !== '49') {
    const verb = syntax === 'declaration' ? 'declare' : 'export';
    fail(`${rel} must ${verb} the exact 49-byte IVM V1 program header`);
  }
}

function assertIvmArtifactIntrinsicGuards(rel) {
  const source = read(rel);
  const requiredMarkers = [
    'const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(',
    'const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(',
    'const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(',
    'const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(',
    'const typedArraySet = Object.getOwnPropertyDescriptor(',
    'const Uint8ArrayIntrinsic = Uint8Array;',
    'const dataViewBufferGetter = Object.getOwnPropertyDescriptor(',
    'const dataViewByteOffsetGetter = Object.getOwnPropertyDescriptor(',
    'const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(',
    'const sharedArrayBufferByteLengthGetter =',
    'sharedArrayBufferByteLengthGetter.call(value)',
    'arrayBufferByteLengthGetter.call(value)',
    'typedArrayBufferGetter.call(value)',
    'typedArrayByteOffsetGetter.call(value)',
    'typedArrayByteLengthGetter.call(value)',
    'dataViewBufferGetter.call(value)',
    'dataViewByteOffsetGetter.call(value)',
    'dataViewByteLengthGetter.call(value)',
    'function copyArrayBufferBytes(buffer, byteOffset, byteLength)',
    'Reflect.apply(typedArraySet, copy, [source])',
    'const byteLength = typedArrayByteLengthGetter.call(bytes)',
    'if (byteLength < IVM_PROGRAM_HEADER_LENGTH)',
    'bytes[0] !== 0x49',
    'bytes[1] !== 0x56',
    'bytes[2] !== 0x4d',
    'bytes[3] !== 0x00',
    'const codeHashInput = new Uint8ArrayIntrinsic(',
    'CONTRACT_CODE_HASH_DOMAIN.length + byteLength',
    'Reflect.apply(typedArraySet, codeHashInput, [CONTRACT_CODE_HASH_DOMAIN])',
    'Reflect.apply(typedArraySet, codeHashInput, [bytes, CONTRACT_CODE_HASH_DOMAIN.length])',
    'const rawCodeHash = blake2b256(codeHashInput)',
  ];
  for (const legacyHashMarker of [
    'const codeBytes = new Uint8ArrayIntrinsic(',
    'byteLength - IVM_PROGRAM_HEADER_LENGTH',
    'blake2b256(codeBytes)',
    'blake2b256(bytes)',
  ]) {
    if (source.includes(legacyHashMarker)) {
      fail(`${rel} must not use legacy or non-domain-separated IVM code hashing: ${legacyHashMarker}`);
    }
  }
  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) {
      fail(`${rel} must retain captured intrinsic getter/copy hardening marker: ${marker}`);
    }
  }
  const canonicalDomainPattern = /const\s+CONTRACT_CODE_HASH_DOMAIN\s*=\s*new\s+TextEncoder\(\)\.encode\(\s*"iroha:ivm:contract-artifact:v1\\0"\s*,?\s*\);/gu;
  if ([...source.matchAll(canonicalDomainPattern)].length !== 1) {
    fail(`${rel} must encode the exact iroha:ivm:contract-artifact:v1\\0 code-hash domain once`);
  }
  for (const unsafeMarker of [
    'value.buffer',
    'value.byteOffset',
    'value.byteLength',
    'copy.set(source)',
  ]) {
    if (source.includes(unsafeMarker)) {
      fail(`${rel} must not trust shadowable artifact view access: ${unsafeMarker}`);
    }
  }
}

function assertIvmArtifactRuntimeContract(rel) {
  let source = read(rel);
  const shaImportPattern = /import\s+\{\s*sha256\s*\}\s+from\s+["']@noble\/hashes\/sha2["'];?/gu;
  const shaImports = [...source.matchAll(shaImportPattern)];
  if (shaImports.length !== 1) {
    fail(`${rel} must import exactly one browser SHA-256 implementation`);
  }
  source = source.replace(shaImportPattern, '');

  const blakeImportPattern = /import\s+\{\s*blake2b256\s*\}\s+from\s+["']\.\/blake2b\.js["'];?/gu;
  const blakeImports = [...source.matchAll(blakeImportPattern)];
  if (blakeImports.length !== 1) {
    fail(`${rel} must import exactly one packaged BLAKE2b implementation`);
  }
  source = source
    .replace(blakeImportPattern, '')
    .replace(/\bexport\s+(?=(?:const|function)\b)/gu, '');

  let blakeSource = read('dist/blake2b.js');
  if (/\bimport\s*(?:\(|\{|\*|["'])/u.test(blakeSource)) {
    fail('dist/blake2b.js must remain a self-contained browser implementation');
  }
  blakeSource = blakeSource.replace(/\bexport\s+(?=(?:const|function|class)\b)/gu, '');

  const context = vm.createContext(Object.create(null), {
    name: 'iroha-js-artifact-validator',
    codeGeneration: { strings: false, wasm: false },
  });
  const setup = `
class TextEncoder {
  encode(value) {
    const text = String(value);
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code > 0x7f) throw new TypeError("validator TextEncoder only accepts ASCII");
      bytes[index] = code;
    }
    return bytes;
  }
}
function __validatorFromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
const __validatorArtifact = Uint8Array.from([
  0x49, 0x56, 0x4d, 0x00,
  0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x01,
  ...Array(32).fill(0),
]);
function sha256(bytes) {
  if (
    bytes.length === __validatorArtifact.length &&
    bytes.every((byte, index) => byte === __validatorArtifact[index])
  ) {
    return __validatorFromHex("b004dd0c3eddd8e1c729e18ce88a2c6ab225fc21f3be1ccf55bac71d403826e6");
  }
  const digest = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    const rotation = index & 7;
    const byte = bytes[index];
    digest[index & 31] ^= ((byte << rotation) | (byte >>> ((8 - rotation) & 7))) & 0xff;
  }
  digest[31] ^= bytes.length & 0xff;
  return digest;
}
const { blake2b256 } = (() => {
${blakeSource}
return { blake2b256 };
})();
${source}
globalThis.__ivmRuntime = {
  computeIvmArtifactHashes,
  IVM_ARTIFACT_MAX_BYTES,
  IVM_PROGRAM_HEADER_LENGTH,
};
globalThis.__artifact = __validatorArtifact;
`;
  try {
    vm.runInContext(setup, context, { timeout: 2_000 });
  } catch (error) {
    fail(`${rel} could not execute in the isolated artifact validator: ${error?.message ?? error}`);
  }

  function evaluate(expression) {
    return vm.runInContext(expression, context, { timeout: 2_000 });
  }

  const runtimeShape = evaluate(`({
    computeType: typeof __ivmRuntime.computeIvmArtifactHashes,
    maxBytes: __ivmRuntime.IVM_ARTIFACT_MAX_BYTES,
    headerLength: __ivmRuntime.IVM_PROGRAM_HEADER_LENGTH,
  })`);
  if (runtimeShape.computeType !== 'function') {
    fail(`${rel} must export computeIvmArtifactHashes`);
  }
  if (runtimeShape.headerLength !== 49 || runtimeShape.maxBytes !== 4 * 1024 * 1024) {
    fail(`${rel} runtime constants must retain the 49-byte header and 4 MiB artifact cap`);
  }

  const expected = {
    codeHashHex: 'b5d6d7f7abf5989ca07b4fbee75560ab7a3dbceaafd442da66a6918e3cb147d1',
    artifactSha256Hex: 'b004dd0c3eddd8e1c729e18ce88a2c6ab225fc21f3be1ccf55bac71d403826e6',
  };
  const actual = evaluate('__ivmRuntime.computeIvmArtifactHashes(__artifact)');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${rel} does not implement the canonical domain-separated full-artifact IVM hash fixture`);
  }

  const markerSensitiveHashes = evaluate(`(() => {
    const mutated = __artifact.slice();
    mutated[4] ^= 0x01;
    return __ivmRuntime.computeIvmArtifactHashes(mutated);
  })()`);
  if (markerSensitiveHashes.codeHashHex !== '3dd50a2d823b72035d0dec7369a1d995a811495457a1e494b8624ba81b820cbd') {
    fail(`${rel} must retain the Iroha prehashed marker bit in the canonical code hash`);
  }

  for (let index = 4; index < 49; index += 1) {
    const mutatedHashes = evaluate(`(() => {
      const mutated = __artifact.slice();
      mutated[${index}] ^= 0x80;
      return __ivmRuntime.computeIvmArtifactHashes(mutated);
    })()`);
    if (
      mutatedHashes.codeHashHex === actual.codeHashHex ||
      mutatedHashes.artifactSha256Hex === actual.artifactSha256Hex
    ) {
      fail(`${rel} code hash and artifact SHA-256 must bind fixed-header byte ${index}`);
    }
  }

  const extendedHashes = evaluate(
    '__ivmRuntime.computeIvmArtifactHashes(Uint8Array.from([...__artifact, 0x80]))',
  );
  if (
    extendedHashes.codeHashHex === actual.codeHashHex ||
    extendedHashes.artifactSha256Hex === actual.artifactSha256Hex
  ) {
    fail(`${rel} code hash and artifact SHA-256 must bind the complete artifact body`);
  }

  function expectRejected(expression, label) {
    try {
      evaluate(expression);
    } catch {
      return;
    }
    fail(`${rel} must reject ${label}`);
  }
  expectRejected(
    '__ivmRuntime.computeIvmArtifactHashes(__artifact.subarray(0, 17))',
    'legacy 17-byte IVM headers',
  );
  expectRejected(
    '__ivmRuntime.computeIvmArtifactHashes(__artifact.subarray(0, 48))',
    'truncated 48-byte IVM headers',
  );
  for (let index = 0; index < 4; index += 1) {
    expectRejected(`(() => {
      const mutated = __artifact.slice();
      mutated[${index}] ^= 0xff;
      return __ivmRuntime.computeIvmArtifactHashes(mutated);
    })()`, `invalid IVM magic byte ${index}`);
  }
  expectRejected(`(() => {
    const oversized = new Uint8Array(__ivmRuntime.IVM_ARTIFACT_MAX_BYTES + 1);
    oversized.set(__artifact);
    return __ivmRuntime.computeIvmArtifactHashes(oversized);
  })()`, 'artifacts larger than 4 MiB');
}

function assertNexusBrowserBundleContract(rel) {
  const source = read(rel);
  const label = 'label: "nexusApp.js (browser)"';
  const labelOffsets = [];
  for (let offset = source.indexOf(label); offset !== -1; offset = source.indexOf(label, offset + label.length)) {
    labelOffsets.push(offset);
  }
  if (labelOffsets.length !== 1) {
    fail(`${rel} must define exactly one Nexus browser bundle target`);
  }
  const start = labelOffsets[0];
  const nextTarget = source.indexOf('label:', start + label.length);
  const target = source.slice(start, nextTarget === -1 ? source.length : nextTarget);
  for (const marker of [
    'entryPoint: join(ROOT, "src", "nexusApp.js")',
    'platform: "browser"',
    'target: "es2020"',
    'forbidNodeInputs: true',
    'forbidGlobalBuffer: true',
    '215,950-byte (210.9 KiB) baseline',
    '5,234 bytes (2.42%)',
    '216 KiB ceiling',
  ]) {
    if (!target.includes(marker)) {
      fail(`${rel} Nexus browser target must retain the audited pinned-esbuild contract: ${marker}`);
    }
  }
  const limits = [...target.matchAll(/\blimitKb:\s*(\d+)\s*,/gu)].map((match) => match[1]);
  if (limits.length !== 1 || limits[0] !== '216') {
    fail(`${rel} Nexus browser target must retain the exact 216 KiB ceiling`);
  }
}

function assertPublicBrowserAggregateContract(rel) {
  const source = read(rel);
  const label = 'label: "browser.js (public aggregate)"';
  const labelOffsets = [];
  for (let offset = source.indexOf(label); offset !== -1; offset = source.indexOf(label, offset + label.length)) {
    labelOffsets.push(offset);
  }
  if (labelOffsets.length !== 1) {
    fail(`${rel} must define exactly one public browser aggregate bundle target`);
  }
  const start = labelOffsets[0];
  const nextTarget = source.indexOf('label:', start + label.length);
  const target = source.slice(start, nextTarget === -1 ? source.length : nextTarget);
  for (const marker of [
    'entryPoint: join(ROOT, "dist", "browser.js")',
    'platform: "browser"',
    'target: "es2020"',
    'forbidNodeInputs: true',
    'forbidGlobalBuffer: true',
    '314,580 bytes (307.2 KiB)',
    '328 KiB leaves 21,292 bytes (6.77%)',
  ]) {
    if (!target.includes(marker)) {
      fail(`${rel} public aggregate must retain the audited pinned-esbuild contract: ${marker}`);
    }
  }
  const limits = [...target.matchAll(/\blimitKb:\s*(\d+)\s*,/gu)].map((match) => match[1]);
  if (limits.length !== 1 || limits[0] !== '328') {
    fail(`${rel} public browser aggregate must retain the exact 328 KiB ceiling`);
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

function assertBrowserOnlyRelativeModuleGraph(entryRel) {
  const pending = [entryRel];
  const visited = new Set();
  while (pending.length > 0) {
    const rel = pending.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const source = read(rel);
    const specifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/gu;
    for (const match of source.matchAll(specifierPattern)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) {
        fail(`${entryRel} browser graph imports forbidden Node builtin ${specifier} through ${rel}`);
      }
      if (!specifier.startsWith('.')) continue;
      let dependency = path.posix.normalize(path.posix.join(path.posix.dirname(rel), specifier));
      if (!path.posix.extname(dependency)) dependency += '.js';
      if (dependency === '..' || dependency.startsWith('../') || path.posix.isAbsolute(dependency)) {
        fail(`${entryRel} browser graph escapes the package through ${rel}: ${specifier}`);
      }
      pending.push(dependency);
    }
  }
}

function assertBrowserPackageModuleGraph(entryRel, browserMap) {
  function mappedPackageFile(target, context) {
    if (typeof target !== 'string' || !target.startsWith('./dist/')) {
      fail(`${context} must map to a packaged ./dist/ JavaScript file`);
    }
    const rel = path.posix.normalize(target.slice(2));
    if (rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) {
      fail(`${context} escapes the package: ${target}`);
    }
    return rel;
  }

  const pending = [entryRel];
  const visited = new Set();
  while (pending.length > 0) {
    const rel = pending.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const source = read(rel);
    const specifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/gu;
    for (const match of source.matchAll(specifierPattern)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) {
        if (!Object.prototype.hasOwnProperty.call(browserMap, specifier)) {
          fail(`${entryRel} browser graph imports unmapped Node builtin ${specifier} through ${rel}`);
        }
        pending.push(mappedPackageFile(browserMap[specifier], `package.json browser ${specifier}`));
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      let dependency = path.posix.normalize(path.posix.join(path.posix.dirname(rel), specifier));
      if (!path.posix.extname(dependency)) dependency += '.js';
      if (dependency === '..' || dependency.startsWith('../') || path.posix.isAbsolute(dependency)) {
        fail(`${entryRel} browser graph escapes the package through ${rel}: ${specifier}`);
      }
      const browserKey = `./${dependency}`;
      if (Object.prototype.hasOwnProperty.call(browserMap, browserKey)) {
        dependency = mappedPackageFile(browserMap[browserKey], `package.json browser ${browserKey}`);
      }
      pending.push(dependency);
    }
  }
}

const pkg = JSON.parse(read('package.json'));
const hasBrowserTransactionCodec = Boolean(pkg.exports?.['./transaction-codec']);
inspectTree(root);
if (inspectedFileCount > 4096) fail(`package contains too many files: ${inspectedFileCount}`);
if (inspectedBytes > 64 * 1024 * 1024) fail(`expanded package exceeds 64 MiB: ${inspectedBytes}`);
if (pkg.name !== '@iroha/iroha-js') fail('package.json name must be @iroha/iroha-js');
if (pkg.type !== 'module') fail('package.json type must be module');
if (pkg.license !== 'Apache-2.0') fail('package.json license must be Apache-2.0');
if (pkg.private === true) fail('package.json private must not be true');

expectExport(pkg, '.', './dist/index.js');
expectExport(pkg, './browser', './dist/browser.js');
expectExport(pkg, './torii-browser', './dist/toriiBrowserClient.js');
expectExport(pkg, './crypto', './dist/crypto.browser.js');
expectExport(pkg, './ivm-artifact', './dist/ivmArtifact.js');
expectExport(pkg, './instruction-builders', './dist/instructionBuilders.js');
expectExport(pkg, './nexus-app', './dist/nexusApp.js');
expectExport(pkg, './canonical-request', './dist/canonicalRequest.js');

if (pkg.browser?.['./dist/crypto.js'] !== './dist/crypto.browser.js') {
  fail('package.json browser map must replace ./dist/crypto.js');
}
if (pkg.browser?.['./dist/native.js'] !== './dist/native.browser.js') {
  fail('package.json browser map must replace ./dist/native.js');
}
if (pkg.browser?.['./dist/cryptoHash.js'] !== './dist/cryptoHash.browser.js') {
  fail('package.json browser map must replace the local crypto adapter');
}
const expectedBrowserKeys = ['./dist/crypto.js', './dist/cryptoHash.js', './dist/native.js'];
const actualBrowserKeys = Object.keys(pkg.browser ?? {}).sort();
if (JSON.stringify(actualBrowserKeys) !== JSON.stringify([...expectedBrowserKeys].sort())) {
  fail(`package.json browser map must contain exactly ${expectedBrowserKeys.join(', ')}`);
}
if (actualBrowserKeys.some((key) => key.startsWith('node:'))) {
  fail('package.json browser map must not replace Node builtins globally');
}
if (pkg.exports?.['./nexus-app']?.browser !== './dist/nexusApp.js') {
  fail('package.json exports ./nexus-app must include browser ./dist/nexusApp.js');
}
if (
  pkg.exports?.['./ivm-artifact']?.browser !== './dist/ivmArtifact.js' ||
  pkg.exports?.['./ivm-artifact']?.import !== './dist/ivmArtifact.js' ||
  pkg.exports?.['./ivm-artifact']?.types !== './ivm-artifact.d.ts'
) {
  fail('package.json exports ./ivm-artifact must expose the browser runtime and standalone declarations');
}
if (JSON.stringify(pkg.typesVersions?.['*']?.['ivm-artifact']) !== JSON.stringify(['./ivm-artifact.d.ts'])) {
  fail('package.json typesVersions ivm-artifact must use standalone declarations');
}
if (!Array.isArray(pkg.files) || !pkg.files.includes('ivm-artifact.d.ts')) {
  fail('package.json files must include ivm-artifact.d.ts');
}
if (
  pkg.exports?.['./canonical-request']?.browser !== './dist/canonicalRequest.js' ||
  pkg.exports?.['./canonical-request']?.import !== './dist/canonicalRequest.js' ||
  pkg.exports?.['./canonical-request']?.types !== './canonical-request.d.ts'
) {
  fail('package.json exports ./canonical-request must expose the browser runtime and standalone declarations');
}
if (JSON.stringify(pkg.typesVersions?.['*']?.['canonical-request']) !== JSON.stringify(['./canonical-request.d.ts'])) {
  fail('package.json typesVersions canonical-request must use standalone declarations');
}
if (!Array.isArray(pkg.files) || !pkg.files.includes('canonical-request.d.ts')) {
  fail('package.json files must include canonical-request.d.ts');
}

[
  'index.d.ts',
  'connect.browser.d.ts',
  'ivm-artifact.d.ts',
  'canonical-request.d.ts',
  'nexus-app.d.ts',
  'dist/index.js',
  'dist/browser.js',
  'dist/toriiBrowserClient.js',
  'dist/crypto.browser.js',
  'dist/cryptoHash.browser.js',
  'dist/cryptoHash.js',
  'dist/ivmArtifact.js',
  'dist/canonicalRequest.js',
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
expectExactIvmHeaderLength('index.d.ts', 'declaration');
expectContains('nexus-app.d.ts', 'NexusTransactionCodec');
expectContains('nexus-app.d.ts', 'NexusAppClient');
expectContains('nexus-app.d.ts', 'finalizeSignedTransaction');
expectContains('nexus-app.d.ts', 'validateBrowserTransferSignable');
expectContains('nexus-app.d.ts', 'import type { Buffer } from "buffer";');
if (/reference\s+types=["']node["']/u.test(read('nexus-app.d.ts'))) {
  fail('nexus-app.d.ts must not depend on ambient Node types');
}
expectContains('connect.browser.d.ts', 'signTransaction');
expectExactIvmHeaderLength('ivm-artifact.d.ts', 'declaration');
expectContains('ivm-artifact.d.ts', 'IVM_ARTIFACT_MAX_BYTES: 4194304');
expectContains('ivm-artifact.d.ts', 'computeIvmArtifactHashes');
if (/reference\s+types=["']node["']/u.test(read('ivm-artifact.d.ts'))) {
  fail('ivm-artifact.d.ts must not depend on ambient Node types');
}
expectContains('canonical-request.d.ts', 'buildCanonicalJsonRequest');
if (/reference\s+types=["']node["']/u.test(read('canonical-request.d.ts'))) {
  fail('canonical-request.d.ts must not depend on ambient Node types');
}
expectContains('dist/browser.js', 'buildTransferAssetInstruction');
expectContains('dist/browser.js', 'ToriiBrowserClient');
expectContains('dist/nexusApp.js', 'NexusAppClient');
expectContains('dist/nexusApp.js', 'finalizeSignedTransaction');
expectContains('dist/native.browser.js', 'iroha_js_host is unavailable in browser builds');
expectContains('dist/cryptoHash.browser.js', 'SHA256_ALIASES');
expectContains('dist/cryptoHash.browser.js', 'ERR_CRYPTO_HASH_FINALIZED');
expectContains('dist/cryptoHash.browser.js', 'randomBytes');
expectExactIvmHeaderLength('dist/ivmArtifact.js', 'runtime');
expectContains('dist/ivmArtifact.js', 'IVM_ARTIFACT_MAX_BYTES = 4 * 1024 * 1024');
assertIvmArtifactIntrinsicGuards('dist/ivmArtifact.js');
expectContains('dist/ivmArtifact.js', 'must not be backed by SharedArrayBuffer');
expectContains('dist/ivmArtifact.js', 'codeHash[codeHash.length - 1] |= 1');
expectContains('dist/ivmArtifact.js', 'artifactSha256Hex');
assertBrowserPackageModuleGraph('dist/browser.js', pkg.browser);
assertBrowserPackageModuleGraph('dist/ivmArtifact.js', pkg.browser);
assertBrowserPackageModuleGraph('dist/canonicalRequest.js', pkg.browser);

if (hasBrowserTransactionCodec) {
  expectExport(pkg, './transaction-codec', './dist/transactionCodec.js');
  if (pkg.exports?.['./transaction-codec']?.browser !== './dist/transactionCodec.js') {
    fail('package.json exports ./transaction-codec must include browser ./dist/transactionCodec.js');
  }
  if (pkg.exports?.['./nexus-app']?.browser !== './dist/nexusApp.js') {
    fail('package.json exports ./nexus-app must keep the reviewed browser ./dist/nexusApp.js entry');
  }
  if (pkg.devDependencies?.esbuild !== '0.28.1') {
    fail('package.json must pin esbuild 0.28.1 for audited browser bundle baselines');
  }
  [
    'transaction-codec.d.ts',
    'dist/transactionCodec.js',
    'src/transactionCodec.js',
    'src/nexusApp.js',
    'src/cryptoHash.browser.js',
    'src/cryptoHash.js',
    'src/ivmArtifact.js',
    'src/canonicalRequest.js',
    'src/instructionBuilders.js',
    'src/normalizers.js',
    'src/norito.js',
    'scripts/bundle-size-check.mjs',
  ].forEach(read);
  if (read('src/nexusApp.js') !== read('dist/nexusApp.js')) {
    fail('browser Nexus source and generated dist entry must be byte-identical');
  }
  if (read('src/transactionCodec.js') !== read('dist/transactionCodec.js')) {
    fail('browser transaction codec source and generated dist entry must be byte-identical');
  }
  if (read('src/cryptoHash.browser.js') !== read('dist/cryptoHash.browser.js')) {
    fail('browser SHA-256 shim source and generated dist entry must be byte-identical');
  }
  if (read('src/cryptoHash.js') !== read('dist/cryptoHash.js')) {
    fail('local Node crypto adapter source and generated dist entry must be byte-identical');
  }
  if (read('src/ivmArtifact.js') !== read('dist/ivmArtifact.js')) {
    fail('IVM artifact source and generated dist entry must be byte-identical');
  }
  expectExactIvmHeaderLength('src/ivmArtifact.js', 'runtime');
  if (read('src/canonicalRequest.js') !== read('dist/canonicalRequest.js')) {
    fail('canonical request source and generated dist entry must be byte-identical');
  }
  for (const moduleName of ['instructionBuilders', 'normalizers', 'norito']) {
    const sourceRel = `src/${moduleName}.js`;
    const distRel = `dist/${moduleName}.js`;
    if (read(sourceRel) !== read(distRel)) {
      fail(`${moduleName} source and generated dist entry must be byte-identical`);
    }
    expectContains(sourceRel, 'import { Buffer } from "buffer"');
    if (read(sourceRel).includes('from "node:buffer"')) {
      fail(`${sourceRel} must not import node:buffer in the public browser graph`);
    }
  }
  expectContains('src/instructionBuilders.js', 'import { createHash } from "./cryptoHash.js"');
  expectContains('src/canonicalRequest.js', 'import { createHash, randomBytes } from "./cryptoHash.js"');
  expectContains('src/cryptoHash.js', 'from "node:crypto"');
  assertIvmArtifactIntrinsicGuards('src/ivmArtifact.js');
  expectContains('src/ivmArtifact.js', 'const rawCodeHash = blake2b256(codeHashInput)');
  expectContains('src/ivmArtifact.js', 'must not be backed by SharedArrayBuffer');
  expectContains('src/ivmArtifact.js', 'codeHash[codeHash.length - 1] |= 1');
  expectContains('src/ivmArtifact.js', 'artifactSha256Hex: bytesToHex(sha256(bytes))');
  expectContains('scripts/bundle-size-check.mjs', 'label: "canonicalRequest.js (browser)"');
  expectContains('scripts/bundle-size-check.mjs', 'limitKb: 75');
  expectContains('scripts/bundle-size-check.mjs', 'checkDistExport(pkg, "./canonical-request", "browser")');
  assertNexusBrowserBundleContract('scripts/bundle-size-check.mjs');
  assertPublicBrowserAggregateContract('scripts/bundle-size-check.mjs');
  expectContains('transaction-codec.d.ts', 'validateBrowserTransferSignable');
  for (const marker of [
    'validateBrowserTransferSignable',
    'has a non-canonical fractional trailing zero',
  ]) {
    expectContains('dist/transactionCodec.js', marker);
  }
  for (const marker of [
    'import { Buffer } from "buffer"',
    'from "./crypto.browser.js"',
    'browserTransactionCodec',
    'function snapshotDataFields',
    'const SIGNABLE_FIELDS = new Set',
    'const CONFIG_FIELDS = new Set',
    'const TRANSFER_DRAFT_FIELDS = new Set',
    'const FINALIZE_OPTION_FIELDS = new Set',
    'const CONNECT_OPTION_FIELDS = new Set',
    'const CONNECT_SESSION_FIELDS = new Set',
    'const APPROVAL_FIELDS = new Set',
    'function validateNexusTransferSignable',
    'function normalizeAliasFamily',
    'function normalizeConsistentByteSources',
    'rawCount > 32',
    'class BrowserToriiPipelineClient',
    'MAX_TORII_RESPONSE_BYTES = 64 * 1024',
    'DEFAULT_TORII_REQUEST_TIMEOUT_MS = 15_000',
    'credentials: "omit"',
    'redirect: "error"',
    'referrerPolicy: "no-referrer"',
  ]) {
    expectContains('dist/nexusApp.js', marker);
  }
  for (const forbidden of [
    'from "node:',
    'from "./native.js"',
    'from "./toriiClient.js"',
    'from "./instructionBuilders.js"',
  ]) {
    if (read('dist/nexusApp.js').includes(forbidden)) {
      fail(`dist/nexusApp.js browser entry must not contain ${forbidden}`);
    }
  }
  assertBrowserOnlyRelativeModuleGraph('dist/nexusApp.js');
  if (pkg.scripts?.['bundle:check'] !== 'node ./scripts/bundle-size-check.mjs') {
    fail('package.json bundle:check must execute the enforced bundle-size gate');
  }
  const bundleGate = read('scripts/bundle-size-check.mjs');
  for (const marker of [
    'checkDistExport(pkg, "./nexus-app", "browser")',
    'findForbiddenBrowserInputs',
  ]) {
    if (!bundleGate.includes(marker)) {
      fail(`scripts/bundle-size-check.mjs must enforce ${marker}`);
    }
  }
} else {
  expectContains('dist/nexusApp.js', 'transaction_codec_unavailable');
  expectContains('dist/nexusApp.js', 'provide config.transactionCodec.buildTransferPayload');
  expectContains('dist/nexusApp.js', 'provide config.transactionCodec.finalizeSignedTransaction');
}

if (exists('native/iroha_js_host.node')) fail('browser package must not include native/iroha_js_host.node');
assertIvmArtifactRuntimeContract('dist/ivmArtifact.js');
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

# Bash 3 treats an empty array expansion as unbound under `set -u`. Seed the
# cleanup list with an inert value so invalid CLI invocations still exit with
# only the intended diagnostic.
TRAP_RM_DIRS=("")
trap_add_rm() {
  TRAP_RM_DIRS+=("$1")
}

cleanup() {
  local dir
  for dir in "${TRAP_RM_DIRS[@]}"; do
    [[ -n "$dir" ]] || continue
    rm -rf "$dir"
  done
}
trap cleanup EXIT

expect_self_test_failure() {
  local label="$1"
  shift
  if ( "$@" ) >/dev/null 2>&1; then
    fail "self-test expected failure did not fail: $label"
  fi
}

write_fixture_package() {
  local dir="$1"
  mkdir -p "$dir/package/dist" "$dir/package/native" "$dir/package/src" "$dir/package/scripts"
  cat > "$dir/package/package.json" <<'JSON'
{
  "name": "@iroha/iroha-js",
  "version": "0.0.3",
  "type": "module",
  "license": "Apache-2.0",
  "private": false,
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./index.d.ts" },
    "./browser": { "browser": "./dist/browser.js", "import": "./dist/browser.js", "types": "./index.d.ts" },
    "./torii-browser": { "browser": "./dist/toriiBrowserClient.js", "import": "./dist/toriiBrowserClient.js", "types": "./index.d.ts" },
    "./crypto": { "browser": "./dist/crypto.browser.js", "import": "./dist/crypto.js", "types": "./index.d.ts" },
    "./ivm-artifact": { "browser": "./dist/ivmArtifact.js", "import": "./dist/ivmArtifact.js", "types": "./ivm-artifact.d.ts" },
    "./instruction-builders": { "import": "./dist/instructionBuilders.js", "types": "./index.d.ts" },
    "./transaction-codec": { "browser": "./dist/transactionCodec.js", "import": "./dist/transactionCodec.js", "types": "./transaction-codec.d.ts" },
    "./nexus-app": { "browser": "./dist/nexusApp.js", "import": "./dist/nexusApp.js", "types": "./nexus-app.d.ts" },
    "./canonical-request": { "browser": "./dist/canonicalRequest.js", "import": "./dist/canonicalRequest.js", "types": "./canonical-request.d.ts" }
  },
  "files": ["ivm-artifact.d.ts", "canonical-request.d.ts", "dist", "src"],
  "typesVersions": { "*": { "ivm-artifact": ["./ivm-artifact.d.ts"], "canonical-request": ["./canonical-request.d.ts"] } },
  "scripts": { "bundle:check": "node ./scripts/bundle-size-check.mjs" },
  "devDependencies": { "esbuild": "0.28.1" },
  "browser": {
    "./dist/crypto.js": "./dist/crypto.browser.js",
    "./dist/cryptoHash.js": "./dist/cryptoHash.browser.js",
    "./dist/native.js": "./dist/native.browser.js"
  }
}
JSON
  printf 'export interface SignedTransactionResult {}\nexport function buildTransferAssetInstruction(): void;\nexport class ToriiClient {}\nexport const IVM_PROGRAM_HEADER_LENGTH: 49;\n' > "$dir/package/index.d.ts"
  printf 'export interface BrowserConnectWallet { signTransaction(): Promise<Uint8Array>; }\n' > "$dir/package/connect.browser.d.ts"
  printf 'export const IVM_PROGRAM_HEADER_LENGTH: 49;\nexport const IVM_ARTIFACT_MAX_BYTES: 4194304;\nexport function computeIvmArtifactHashes(artifact: Uint8Array | ArrayBuffer | ArrayBufferView): { codeHashHex: string; artifactSha256Hex: string };\n' > "$dir/package/ivm-artifact.d.ts"
  printf 'import type { Buffer } from "buffer";\nexport function buildCanonicalJsonRequest(): Promise<{ body: string }>;\nexport function canonicalRequestMessage(): Buffer;\n' > "$dir/package/canonical-request.d.ts"
  printf 'import type { Buffer } from "buffer";\nexport interface NexusTransactionCodec { finalizeSignedTransaction(): void; bytes?: Buffer; }\nexport class NexusAppClient {}\nexport { validateBrowserTransferSignable } from "./transaction-codec.js";\n' > "$dir/package/nexus-app.d.ts"
  printf 'export const browserTransactionCodec: object;\nexport function validateBrowserTransferSignable(): object;\n' > "$dir/package/transaction-codec.d.ts"
  printf 'export { buildTransferAssetInstruction } from "./instructionBuilders.js";\nexport { ToriiBrowserClient } from "./toriiBrowserClient.js";\nexport { computeIvmArtifactHashes } from "./ivmArtifact.js";\n' > "$dir/package/dist/browser.js"
  printf 'export function getNativeBinding() { throw new Error("iroha_js_host is unavailable in browser builds."); }\n' > "$dir/package/dist/native.browser.js"
  for file in index toriiBrowserClient crypto.browser instructionBuilders transaction norito normalizers address; do
    printf 'export const marker = "%s";\n' "$file" > "$dir/package/dist/$file.js"
  done
  printf 'import { Buffer } from "buffer";\nimport { createHash } from "./cryptoHash.js";\nexport const marker = { Buffer, createHash };\n' > \
    "$dir/package/dist/instructionBuilders.js"
  printf 'import { Buffer } from "buffer";\nexport const marker = Buffer;\n' > \
    "$dir/package/dist/normalizers.js"
  printf 'import { Buffer } from "buffer";\nexport const marker = Buffer;\n' > \
    "$dir/package/dist/norito.js"
  cat > "$dir/package/dist/cryptoHash.browser.js" <<'JS'
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2";
const SHA256_ALIASES = new Set(["sha256", "sha-256"]);
export function createHash() {
  const error = new Error("Digest already called");
  error.code = "ERR_CRYPTO_HASH_FINALIZED";
  return { digest: () => Buffer.from(sha256(new Uint8Array())) };
}
export function randomBytes(size) {
  return Buffer.alloc(size, 7);
}
JS
  printf 'export { createHash, randomBytes } from "node:crypto";\n' > "$dir/package/dist/cryptoHash.js"
  cat > "$dir/package/dist/blake2b.js" <<'JS'
const DOMAIN = new TextEncoder().encode("iroha:ivm:contract-artifact:v1\0");
const ARTIFACT = Uint8Array.from([
  0x49, 0x56, 0x4d, 0x00,
  0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x01,
  ...Array(32).fill(0),
]);
function fromHex(hex) {
  return Uint8Array.from(hex.match(/../gu), (pair) => Number.parseInt(pair, 16));
}
function equalsAt(bytes, expected, offset) {
  if (bytes.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}
export function blake2b256(bytes) {
  if (bytes.length === DOMAIN.length + ARTIFACT.length && equalsAt(bytes, DOMAIN, 0)) {
    if (equalsAt(bytes, ARTIFACT, DOMAIN.length)) {
      return fromHex("b5d6d7f7abf5989ca07b4fbee75560ab7a3dbceaafd442da66a6918e3cb147d1");
    }
    const markerSensitive = ARTIFACT.slice();
    markerSensitive[4] ^= 0x01;
    if (equalsAt(bytes, markerSensitive, DOMAIN.length)) {
      return fromHex("3dd50a2d823b72035d0dec7369a1d995a811495457a1e494b8624ba81b820cbc");
    }
  }
  return new Uint8Array(32);
}
JS
  cat > "$dir/package/dist/ivmArtifact.js" <<'JS'
import { sha256 } from "@noble/hashes/sha2";
import { blake2b256 } from "./blake2b.js";
export const IVM_PROGRAM_HEADER_LENGTH = 49;
export const IVM_ARTIFACT_MAX_BYTES = 4 * 1024 * 1024;
const CONTRACT_CODE_HASH_DOMAIN = new TextEncoder().encode(
  "iroha:ivm:contract-artifact:v1\0",
);
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
).get;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
).get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
).get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
).get;
const typedArraySet = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "set",
).value;
const Uint8ArrayIntrinsic = Uint8Array;
const dataViewBufferGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "buffer",
).get;
const dataViewByteOffsetGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "byteOffset",
).get;
const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "byteLength",
).get;
const sharedArrayBufferByteLengthGetter =
  typeof SharedArrayBuffer === "undefined"
    ? null
    : Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        "byteLength",
      ).get;
function isSharedBuffer(value) {
  if (sharedArrayBufferByteLengthGetter === null) return false;
  try {
    sharedArrayBufferByteLengthGetter.call(value);
    return true;
  } catch {
    return false;
  }
}
function isArrayBuffer(value) {
  try {
    arrayBufferByteLengthGetter.call(value);
    return true;
  } catch {
    return false;
  }
}
function getArrayBufferViewInfo(value) {
  try {
    return {
      buffer: typedArrayBufferGetter.call(value),
      byteOffset: typedArrayByteOffsetGetter.call(value),
      byteLength: typedArrayByteLengthGetter.call(value),
    };
  } catch {
    try {
      return {
        buffer: dataViewBufferGetter.call(value),
        byteOffset: dataViewByteOffsetGetter.call(value),
        byteLength: dataViewByteLengthGetter.call(value),
      };
    } catch {
      return null;
    }
  }
}
function assertArtifactByteLength(byteLength) {
  if (byteLength > IVM_ARTIFACT_MAX_BYTES) throw new RangeError("IVM artifact is too large");
}
function copyArrayBufferBytes(buffer, byteOffset, byteLength) {
  const source = new Uint8ArrayIntrinsic(buffer, byteOffset, byteLength);
  const copy = new Uint8ArrayIntrinsic(byteLength);
  Reflect.apply(typedArraySet, copy, [source]);
  return copy;
}
function artifactBytes(value) {
  if (isSharedBuffer(value)) {
    throw new TypeError("artifact must not be backed by SharedArrayBuffer");
  }
  if (isArrayBuffer(value)) {
    const byteLength = arrayBufferByteLengthGetter.call(value);
    assertArtifactByteLength(byteLength);
    return copyArrayBufferBytes(value, 0, byteLength);
  }
  const view = getArrayBufferViewInfo(value);
  if (view !== null) {
    if (isSharedBuffer(view.buffer)) {
      throw new TypeError("artifact must not be backed by SharedArrayBuffer");
    }
    assertArtifactByteLength(view.byteLength);
    return copyArrayBufferBytes(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new TypeError("invalid artifact");
}
function bytesToHex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
export function computeIvmArtifactHashes(value) {
  const bytes = artifactBytes(value);
  const byteLength = typedArrayByteLengthGetter.call(bytes);
  if (byteLength < IVM_PROGRAM_HEADER_LENGTH) {
    throw new RangeError("IVM artifact must contain at least the 49-byte program header");
  }
  if (
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x56 ||
    bytes[2] !== 0x4d ||
    bytes[3] !== 0x00
  ) {
    throw new TypeError("IVM artifact has an invalid program header magic");
  }
  const codeHashInput = new Uint8ArrayIntrinsic(
    CONTRACT_CODE_HASH_DOMAIN.length + byteLength,
  );
  Reflect.apply(typedArraySet, codeHashInput, [CONTRACT_CODE_HASH_DOMAIN]);
  Reflect.apply(typedArraySet, codeHashInput, [bytes, CONTRACT_CODE_HASH_DOMAIN.length]);
  const rawCodeHash = blake2b256(codeHashInput);
  const codeHash = copyArrayBufferBytes(
    typedArrayBufferGetter.call(rawCodeHash),
    typedArrayByteOffsetGetter.call(rawCodeHash),
    typedArrayByteLengthGetter.call(rawCodeHash),
  );
  codeHash[codeHash.length - 1] |= 1;
  return { codeHashHex: bytesToHex(codeHash), artifactSha256Hex: bytesToHex(sha256(bytes)) };
}
JS
  printf 'import { Buffer } from "buffer";\nimport { createHash, randomBytes } from "./cryptoHash.js";\nexport function buildCanonicalJsonRequest() { return { body: createHash("sha256").update(Buffer.from(randomBytes(1))).digest("hex") }; }\n' > "$dir/package/dist/canonicalRequest.js"
  cat > "$dir/package/dist/nexusApp.js" <<'JS'
import { Buffer } from "buffer";
import { verifyEd25519 } from "./crypto.browser.js";
import { browserTransactionCodec } from "./transactionCodec.js";
const MAX_TORII_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TORII_REQUEST_TIMEOUT_MS = 15_000;
function snapshotDataFields() {}
function normalizeAliasFamily() {}
function normalizeConsistentByteSources() {}
function validateNexusTransferSignable() {}
const rawCount = 33; if (rawCount > 32) throw new Error();
const SIGNABLE_FIELDS = new Set();
const CONFIG_FIELDS = new Set();
const TRANSFER_DRAFT_FIELDS = new Set();
const FINALIZE_OPTION_FIELDS = new Set();
const CONNECT_OPTION_FIELDS = new Set();
const CONNECT_SESSION_FIELDS = new Set();
const APPROVAL_FIELDS = new Set();
export class NexusAppClient { transferWithWallet(session, input) { return snapshotDataFields(input, TRANSFER_DRAFT_FIELDS); } }
export function finalizeSignedTransaction() {}
export class BrowserToriiPipelineClient { submit() { return { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }; } }
export const browserMarkers = { Buffer, verifyEd25519, browserTransactionCodec, MAX_TORII_RESPONSE_BYTES, DEFAULT_TORII_REQUEST_TIMEOUT_MS };
JS
  printf 'export function validateBrowserTransferSignable() {}\nconst canonicalNumeric = "has a non-canonical fractional trailing zero";\nexport const browserTransactionCodec = Object.freeze({ validateSignable: validateBrowserTransferSignable });\n' > "$dir/package/dist/transactionCodec.js"
  cp "$dir/package/dist/nexusApp.js" "$dir/package/src/nexusApp.js"
  cp "$dir/package/dist/transactionCodec.js" "$dir/package/src/transactionCodec.js"
  cp "$dir/package/dist/cryptoHash.browser.js" "$dir/package/src/cryptoHash.browser.js"
  cp "$dir/package/dist/cryptoHash.js" "$dir/package/src/cryptoHash.js"
  cp "$dir/package/dist/ivmArtifact.js" "$dir/package/src/ivmArtifact.js"
  cp "$dir/package/dist/canonicalRequest.js" "$dir/package/src/canonicalRequest.js"
  cp "$dir/package/dist/instructionBuilders.js" "$dir/package/src/instructionBuilders.js"
  cp "$dir/package/dist/normalizers.js" "$dir/package/src/normalizers.js"
  cp "$dir/package/dist/norito.js" "$dir/package/src/norito.js"
  cat > "$dir/package/scripts/bundle-size-check.mjs" <<'JS'
const target = {
  label: "nexusApp.js (browser)",
  entryPoint: join(ROOT, "src", "nexusApp.js"),
  platform: "browser",
  target: "es2020",
  // The current 215,950-byte (210.9 KiB) baseline includes canonical
  // Numeric V1/Quantity validation and leaves 5,234 bytes (2.42%) below
  // the 216 KiB ceiling.
  limitKb: 216,
  forbidNodeInputs: true,
  forbidGlobalBuffer: true,
};
const aggregate = {
  label: "browser.js (public aggregate)",
  entryPoint: join(ROOT, "dist", "browser.js"),
  platform: "browser",
  target: "es2020",
  // The browser-clean public aggregate is 314,580 bytes (307.2 KiB) with
  // pinned esbuild; 328 KiB leaves 21,292 bytes (6.77%) for the complete
  // namespace after canonical Numeric V1/Quantity support was added.
  limitKb: 328,
  forbidNodeInputs: true,
  forbidGlobalBuffer: true,
};
const canonicalRequest = {
  label: "canonicalRequest.js (browser)",
  entryPoint: join(ROOT, "dist", "canonicalRequest.js"),
  platform: "browser",
  limitKb: 75,
  forbidNodeInputs: true,
};
function findForbiddenBrowserInputs() {}
checkDistExport(pkg, "./nexus-app", "browser");
checkDistExport(pkg, "./canonical-request", "browser");
JS
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

  cp -R "$tmp/valid" "$tmp/nested-native-addon"
  mkdir -p "$tmp/nested-native-addon/package/dist/hidden"
  printf 'native' > "$tmp/nested-native-addon/package/dist/hidden/renamed.node"
  make_fixture_tarball "$tmp/nested-native-addon" "$tmp/nested-native-addon.tgz"
  expect_self_test_failure "nested native addon packaged" validate_tarball "$tmp/nested-native-addon.tgz"

  cp -R "$tmp/valid" "$tmp/symlink-entry"
  ln -s ../package.json "$tmp/symlink-entry/package/dist/package-link"
  make_fixture_tarball "$tmp/symlink-entry" "$tmp/symlink-entry.tgz"
  expect_self_test_failure "symbolic link packaged" validate_tarball "$tmp/symlink-entry.tgz"

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

  cp -R "$tmp/valid" "$tmp/ivm-artifact-ambient-node-types"
  printf '%s\n' '/// <reference types="node" />' >> \
    "$tmp/ivm-artifact-ambient-node-types/package/ivm-artifact.d.ts"
  make_fixture_tarball "$tmp/ivm-artifact-ambient-node-types" "$tmp/ivm-artifact-ambient-node-types.tgz"
  expect_self_test_failure "IVM artifact ambient Node declaration dependency" validate_tarball "$tmp/ivm-artifact-ambient-node-types.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-main-header-regressed"
  sed -i.bak 's/IVM_PROGRAM_HEADER_LENGTH: 49/IVM_PROGRAM_HEADER_LENGTH: 17/' \
    "$tmp/ivm-artifact-main-header-regressed/package/index.d.ts"
  rm -f "$tmp/ivm-artifact-main-header-regressed/package/index.d.ts.bak"
  make_fixture_tarball "$tmp/ivm-artifact-main-header-regressed" "$tmp/ivm-artifact-main-header-regressed.tgz"
  expect_self_test_failure "main IVM header declaration regressed to 17 bytes" validate_tarball "$tmp/ivm-artifact-main-header-regressed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-subpath-header-regressed"
  sed -i.bak 's/IVM_PROGRAM_HEADER_LENGTH: 49/IVM_PROGRAM_HEADER_LENGTH: 17/' \
    "$tmp/ivm-artifact-subpath-header-regressed/package/ivm-artifact.d.ts"
  rm -f "$tmp/ivm-artifact-subpath-header-regressed/package/ivm-artifact.d.ts.bak"
  make_fixture_tarball "$tmp/ivm-artifact-subpath-header-regressed" "$tmp/ivm-artifact-subpath-header-regressed.tgz"
  expect_self_test_failure "standalone IVM header declaration regressed to 17 bytes" validate_tarball "$tmp/ivm-artifact-subpath-header-regressed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-runtime-header-regressed"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/IVM_PROGRAM_HEADER_LENGTH = 49/IVM_PROGRAM_HEADER_LENGTH = 17/' \
      "$tmp/ivm-artifact-runtime-header-regressed/package/$module"
    rm -f "$tmp/ivm-artifact-runtime-header-regressed/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-runtime-header-regressed" "$tmp/ivm-artifact-runtime-header-regressed.tgz"
  expect_self_test_failure "IVM runtime header regressed to 17 bytes" validate_tarball "$tmp/ivm-artifact-runtime-header-regressed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-source-dist-drift"
  printf '// drift\n' >> "$tmp/ivm-artifact-source-dist-drift/package/dist/ivmArtifact.js"
  make_fixture_tarball "$tmp/ivm-artifact-source-dist-drift" "$tmp/ivm-artifact-source-dist-drift.tgz"
  expect_self_test_failure "IVM artifact source/dist drift" validate_tarball "$tmp/ivm-artifact-source-dist-drift.tgz"

  cp -R "$tmp/valid" "$tmp/missing-ivm-artifact-export"
  node - "$tmp/missing-ivm-artifact-export/package/package.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pkg.exports['./ivm-artifact'];
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  make_fixture_tarball "$tmp/missing-ivm-artifact-export" "$tmp/missing-ivm-artifact-export.tgz"
  expect_self_test_failure "missing IVM artifact browser export" validate_tarball "$tmp/missing-ivm-artifact-export.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-size-cap-weakened"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/IVM_ARTIFACT_MAX_BYTES = 4 \* 1024 \* 1024/IVM_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024/' \
      "$tmp/ivm-artifact-size-cap-weakened/package/$module"
    rm -f "$tmp/ivm-artifact-size-cap-weakened/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-size-cap-weakened" "$tmp/ivm-artifact-size-cap-weakened.tgz"
  expect_self_test_failure "IVM artifact size cap weakened" validate_tarball "$tmp/ivm-artifact-size-cap-weakened.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-shared-memory-accepted"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/must not be backed by SharedArrayBuffer/shared memory accepted/' \
      "$tmp/ivm-artifact-shared-memory-accepted/package/$module"
    rm -f "$tmp/ivm-artifact-shared-memory-accepted/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-shared-memory-accepted" "$tmp/ivm-artifact-shared-memory-accepted.tgz"
  expect_self_test_failure "IVM artifact shared-memory rejection removed" validate_tarball "$tmp/ivm-artifact-shared-memory-accepted.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-intrinsic-guards-removed"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak \
      -e 's/arrayBufferByteLengthGetter\.call(value)/value.byteLength/g' \
      -e 's/Reflect\.apply(typedArraySet, copy, \[source\])/copy.set(source)/g' \
      "$tmp/ivm-artifact-intrinsic-guards-removed/package/$module"
    rm -f "$tmp/ivm-artifact-intrinsic-guards-removed/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-intrinsic-guards-removed" "$tmp/ivm-artifact-intrinsic-guards-removed.tgz"
  expect_self_test_failure "IVM artifact intrinsic getter and copy hardening removed" validate_tarball "$tmp/ivm-artifact-intrinsic-guards-removed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-marker-bit-removed"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/codeHash\[codeHash.length - 1\] |= 1;//' \
      "$tmp/ivm-artifact-marker-bit-removed/package/$module"
    rm -f "$tmp/ivm-artifact-marker-bit-removed/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-marker-bit-removed" "$tmp/ivm-artifact-marker-bit-removed.tgz"
  expect_self_test_failure "IVM artifact prehashed marker bit removed" validate_tarball "$tmp/ivm-artifact-marker-bit-removed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-legacy-body-only-hash"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    node - "$tmp/ivm-artifact-legacy-body-only-hash/package/$module" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
const canonical = `  const codeHashInput = new Uint8ArrayIntrinsic(
    CONTRACT_CODE_HASH_DOMAIN.length + byteLength,
  );
  Reflect.apply(typedArraySet, codeHashInput, [CONTRACT_CODE_HASH_DOMAIN]);
  Reflect.apply(typedArraySet, codeHashInput, [bytes, CONTRACT_CODE_HASH_DOMAIN.length]);
  const rawCodeHash = blake2b256(codeHashInput);`;
const legacy = `  const byteBuffer = typedArrayBufferGetter.call(bytes);
  const codeBytes = new Uint8ArrayIntrinsic(
    byteBuffer,
    IVM_PROGRAM_HEADER_LENGTH,
    byteLength - IVM_PROGRAM_HEADER_LENGTH,
  );
  const rawCodeHash = blake2b256(codeBytes);`;
if (!source.includes(canonical)) process.exit(2);
fs.writeFileSync(file, source.replace(canonical, legacy));
NODE
  done
  make_fixture_tarball "$tmp/ivm-artifact-legacy-body-only-hash" "$tmp/ivm-artifact-legacy-body-only-hash.tgz"
  expect_self_test_failure "legacy body-only IVM code hash" validate_tarball "$tmp/ivm-artifact-legacy-body-only-hash.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-domain-nul-removed"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    node - "$tmp/ivm-artifact-domain-nul-removed/package/$module" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
const canonical = 'iroha:ivm:contract-artifact:v1\\0';
if (!source.includes(canonical)) process.exit(2);
fs.writeFileSync(file, source.replace(canonical, 'iroha:ivm:contract-artifact:v1'));
NODE
  done
  make_fixture_tarball "$tmp/ivm-artifact-domain-nul-removed" "$tmp/ivm-artifact-domain-nul-removed.tgz"
  expect_self_test_failure "IVM code-hash domain NUL terminator removed" validate_tarball "$tmp/ivm-artifact-domain-nul-removed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-domain-separation-removed"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/blake2b256(codeHashInput)/blake2b256(bytes)/' \
      "$tmp/ivm-artifact-domain-separation-removed/package/$module"
    rm -f "$tmp/ivm-artifact-domain-separation-removed/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-domain-separation-removed" "$tmp/ivm-artifact-domain-separation-removed.tgz"
  expect_self_test_failure "IVM code-hash domain separation removed" validate_tarball "$tmp/ivm-artifact-domain-separation-removed.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-validator-escape"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    node - "$tmp/ivm-artifact-validator-escape/package/$module" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, `globalThis.constructor.constructor("return process")();\n${source}`);
NODE
  done
  make_fixture_tarball "$tmp/ivm-artifact-validator-escape" "$tmp/ivm-artifact-validator-escape.tgz"
  expect_self_test_failure "IVM artifact validator host escape" validate_tarball "$tmp/ivm-artifact-validator-escape.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-full-hash-weakened"
  for module in src/ivmArtifact.js dist/ivmArtifact.js; do
    sed -i.bak 's/sha256(bytes))/sha256(bytes.subarray(IVM_PROGRAM_HEADER_LENGTH)))/' \
      "$tmp/ivm-artifact-full-hash-weakened/package/$module"
    rm -f "$tmp/ivm-artifact-full-hash-weakened/package/$module.bak"
  done
  make_fixture_tarball "$tmp/ivm-artifact-full-hash-weakened" "$tmp/ivm-artifact-full-hash-weakened.tgz"
  expect_self_test_failure "IVM artifact full SHA-256 weakened to body only" validate_tarball "$tmp/ivm-artifact-full-hash-weakened.tgz"

  cp -R "$tmp/valid" "$tmp/ivm-artifact-declaration-size-drift"
  sed -i.bak 's/IVM_ARTIFACT_MAX_BYTES: 4194304/IVM_ARTIFACT_MAX_BYTES: 8388608/' \
    "$tmp/ivm-artifact-declaration-size-drift/package/ivm-artifact.d.ts"
  rm -f "$tmp/ivm-artifact-declaration-size-drift/package/ivm-artifact.d.ts.bak"
  make_fixture_tarball "$tmp/ivm-artifact-declaration-size-drift" "$tmp/ivm-artifact-declaration-size-drift.tgz"
  expect_self_test_failure "IVM artifact declaration size cap drift" validate_tarball "$tmp/ivm-artifact-declaration-size-drift.tgz"

  cp -R "$tmp/valid" "$tmp/canonical-ambient-node-types"
  printf '%s\n' '/// <reference types="node" />' >> \
    "$tmp/canonical-ambient-node-types/package/canonical-request.d.ts"
  make_fixture_tarball "$tmp/canonical-ambient-node-types" "$tmp/canonical-ambient-node-types.tgz"
  expect_self_test_failure "canonical request ambient Node declaration dependency" validate_tarball "$tmp/canonical-ambient-node-types.tgz"

  cp -R "$tmp/valid" "$tmp/canonical-source-dist-drift"
  printf '// drift\n' >> "$tmp/canonical-source-dist-drift/package/dist/canonicalRequest.js"
  make_fixture_tarball "$tmp/canonical-source-dist-drift" "$tmp/canonical-source-dist-drift.tgz"
  expect_self_test_failure "canonical request source/dist drift" validate_tarball "$tmp/canonical-source-dist-drift.tgz"

  cp -R "$tmp/valid" "$tmp/local-crypto-source-dist-drift"
  printf '// drift\n' >> "$tmp/local-crypto-source-dist-drift/package/dist/cryptoHash.js"
  make_fixture_tarball "$tmp/local-crypto-source-dist-drift" "$tmp/local-crypto-source-dist-drift.tgz"
  expect_self_test_failure "local crypto adapter source/dist drift" validate_tarball "$tmp/local-crypto-source-dist-drift.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-native-import"
  printf 'import { getNativeBinding } from "./native.js";\n' >> \
    "$tmp/nexus-native-import/package/dist/nexusApp.js"
  cp "$tmp/nexus-native-import/package/dist/nexusApp.js" \
    "$tmp/nexus-native-import/package/src/nexusApp.js"
  make_fixture_tarball "$tmp/nexus-native-import" "$tmp/nexus-native-import.tgz"
  expect_self_test_failure "Nexus native import restored" validate_tarball "$tmp/nexus-native-import.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-buffer-global"
  sed -i.bak 's/import { Buffer } from "buffer";//' \
    "$tmp/nexus-buffer-global/package/dist/nexusApp.js"
  rm -f "$tmp/nexus-buffer-global/package/dist/nexusApp.js.bak"
  cp "$tmp/nexus-buffer-global/package/dist/nexusApp.js" \
    "$tmp/nexus-buffer-global/package/src/nexusApp.js"
  make_fixture_tarball "$tmp/nexus-buffer-global" "$tmp/nexus-buffer-global.tgz"
  expect_self_test_failure "Nexus global Buffer dependency" validate_tarball "$tmp/nexus-buffer-global.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-bundle-cap"
  sed -i.bak 's/limitKb: 216/limitKb: 217/' \
    "$tmp/nexus-bundle-cap/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/nexus-bundle-cap/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/nexus-bundle-cap" "$tmp/nexus-bundle-cap.tgz"
  expect_self_test_failure "Nexus browser bundle cap weakened" validate_tarball "$tmp/nexus-bundle-cap.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-legacy-bundle-cap"
  sed -i.bak 's/limitKb: 216/limitKb: 205/' \
    "$tmp/nexus-legacy-bundle-cap/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/nexus-legacy-bundle-cap/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/nexus-legacy-bundle-cap" "$tmp/nexus-legacy-bundle-cap.tgz"
  expect_self_test_failure "Nexus browser legacy 205 KiB cap restored" validate_tarball "$tmp/nexus-legacy-bundle-cap.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-bundle-baseline-drift"
  sed -i.bak 's/215,950-byte/215,951-byte/' \
    "$tmp/nexus-bundle-baseline-drift/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/nexus-bundle-baseline-drift/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/nexus-bundle-baseline-drift" "$tmp/nexus-bundle-baseline-drift.tgz"
  expect_self_test_failure "Nexus browser reviewed baseline drift" validate_tarball "$tmp/nexus-bundle-baseline-drift.tgz"

  cp -R "$tmp/valid" "$tmp/canonical-request-bundle-cap"
  sed -i.bak 's/limitKb: 75/limitKb: 76/' \
    "$tmp/canonical-request-bundle-cap/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/canonical-request-bundle-cap/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/canonical-request-bundle-cap" "$tmp/canonical-request-bundle-cap.tgz"
  expect_self_test_failure "canonical request browser bundle cap weakened" validate_tarball "$tmp/canonical-request-bundle-cap.tgz"

  cp -R "$tmp/valid" "$tmp/missing-local-crypto-map"
  node - "$tmp/missing-local-crypto-map/package/package.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pkg.browser['./dist/cryptoHash.js'];
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  make_fixture_tarball "$tmp/missing-local-crypto-map" "$tmp/missing-local-crypto-map.tgz"
  expect_self_test_failure "public aggregate local crypto map removed" validate_tarball "$tmp/missing-local-crypto-map.tgz"

  cp -R "$tmp/valid" "$tmp/global-node-crypto-map"
  node - "$tmp/global-node-crypto-map/package/package.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.browser['node:crypto'] = './dist/cryptoHash.browser.js';
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  make_fixture_tarball "$tmp/global-node-crypto-map" "$tmp/global-node-crypto-map.tgz"
  expect_self_test_failure "global node:crypto browser map restored" validate_tarball "$tmp/global-node-crypto-map.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-node-edge"
  printf 'import "node:fs";\n' >> "$tmp/aggregate-node-edge/package/dist/browser.js"
  make_fixture_tarball "$tmp/aggregate-node-edge" "$tmp/aggregate-node-edge.tgz"
  expect_self_test_failure "public aggregate forbidden Node edge restored" validate_tarball "$tmp/aggregate-node-edge.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-bundle-cap"
  sed -i.bak 's/limitKb: 328/limitKb: 329/' \
    "$tmp/aggregate-bundle-cap/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/aggregate-bundle-cap/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/aggregate-bundle-cap" "$tmp/aggregate-bundle-cap.tgz"
  expect_self_test_failure "public aggregate browser bundle cap weakened" validate_tarball "$tmp/aggregate-bundle-cap.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-legacy-bundle-cap"
  sed -i.bak 's/limitKb: 328/limitKb: 300/' \
    "$tmp/aggregate-legacy-bundle-cap/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/aggregate-legacy-bundle-cap/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/aggregate-legacy-bundle-cap" "$tmp/aggregate-legacy-bundle-cap.tgz"
  expect_self_test_failure "public aggregate legacy 300 KiB cap restored" validate_tarball "$tmp/aggregate-legacy-bundle-cap.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-bundle-baseline-drift"
  sed -i.bak 's/314,580 bytes/314,581 bytes/' \
    "$tmp/aggregate-bundle-baseline-drift/package/scripts/bundle-size-check.mjs"
  rm -f "$tmp/aggregate-bundle-baseline-drift/package/scripts/bundle-size-check.mjs.bak"
  make_fixture_tarball "$tmp/aggregate-bundle-baseline-drift" "$tmp/aggregate-bundle-baseline-drift.tgz"
  expect_self_test_failure "public aggregate reviewed baseline drift" validate_tarball "$tmp/aggregate-bundle-baseline-drift.tgz"

  cp -R "$tmp/valid" "$tmp/sha-shim-dist-drift"
  printf '// drift\n' >> "$tmp/sha-shim-dist-drift/package/dist/cryptoHash.browser.js"
  make_fixture_tarball "$tmp/sha-shim-dist-drift" "$tmp/sha-shim-dist-drift.tgz"
  expect_self_test_failure "browser SHA-256 shim source/dist drift" validate_tarball "$tmp/sha-shim-dist-drift.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-module-dist-drift"
  printf '// drift\n' >> "$tmp/aggregate-module-dist-drift/package/dist/normalizers.js"
  make_fixture_tarball "$tmp/aggregate-module-dist-drift" "$tmp/aggregate-module-dist-drift.tgz"
  expect_self_test_failure "aggregate normalizers source/dist drift" validate_tarball "$tmp/aggregate-module-dist-drift.tgz"

  cp -R "$tmp/valid" "$tmp/aggregate-node-buffer"
  for module in src/normalizers.js dist/normalizers.js; do
    sed -i.bak 's/from "buffer"/from "node:buffer"/' "$tmp/aggregate-node-buffer/package/$module"
    rm -f "$tmp/aggregate-node-buffer/package/$module.bak"
  done
  make_fixture_tarball "$tmp/aggregate-node-buffer" "$tmp/aggregate-node-buffer.tgz"
  expect_self_test_failure "aggregate node:buffer edge restored" validate_tarball "$tmp/aggregate-node-buffer.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-connect-snapshot"
  sed -i.bak 's/const CONNECT_SESSION_FIELDS = new Set();//' \
    "$tmp/nexus-connect-snapshot/package/dist/nexusApp.js"
  rm -f "$tmp/nexus-connect-snapshot/package/dist/nexusApp.js.bak"
  cp "$tmp/nexus-connect-snapshot/package/dist/nexusApp.js" \
    "$tmp/nexus-connect-snapshot/package/src/nexusApp.js"
  make_fixture_tarball "$tmp/nexus-connect-snapshot" "$tmp/nexus-connect-snapshot.tgz"
  expect_self_test_failure "Nexus Connect-session snapshot allowlist removed" validate_tarball "$tmp/nexus-connect-snapshot.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-ambient-node-types"
  printf '%s\n' '/// <reference types="node" />' >> \
    "$tmp/nexus-ambient-node-types/package/nexus-app.d.ts"
  make_fixture_tarball "$tmp/nexus-ambient-node-types" "$tmp/nexus-ambient-node-types.tgz"
  expect_self_test_failure "Nexus ambient Node declaration dependency" validate_tarball "$tmp/nexus-ambient-node-types.tgz"

  cp -R "$tmp/valid" "$tmp/nexus-signable-prevalidation"
  sed -i.bak 's/function validateNexusTransferSignable/function trustUnvalidatedSignable/' \
    "$tmp/nexus-signable-prevalidation/package/dist/nexusApp.js"
  rm -f "$tmp/nexus-signable-prevalidation/package/dist/nexusApp.js.bak"
  cp "$tmp/nexus-signable-prevalidation/package/dist/nexusApp.js" \
    "$tmp/nexus-signable-prevalidation/package/src/nexusApp.js"
  make_fixture_tarball "$tmp/nexus-signable-prevalidation" "$tmp/nexus-signable-prevalidation.tgz"
  expect_self_test_failure "Nexus signer prevalidation removed" validate_tarball "$tmp/nexus-signable-prevalidation.tgz"

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
