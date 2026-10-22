#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-public-artifacts.sh"
CHECK_IROHA_JS_SDK_SCRIPT="$SCRIPT_DIR/check-iroha-js-sdk-artifact.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "[public-artifacts-audit-test][error] $*" >&2
  exit 1
}

write_fixture_package() {
  local package_dir="$1"

  mkdir -p "$package_dir/dist" "$package_dir/native" "$package_dir/src" "$package_dir/scripts"

  cat > "$package_dir/package.json" <<'JSON'
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
  "typesVersions": { "*": { "ivm-artifact": ["./ivm-artifact.d.ts"], "canonical-request": ["./canonical-request.d.ts"] } },
  "files": ["index.d.ts", "connect.browser.d.ts", "ivm-artifact.d.ts", "canonical-request.d.ts", "nexus-app.d.ts", "transaction-codec.d.ts", "dist", "src", "scripts"],
  "scripts": { "bundle:check": "node ./scripts/bundle-size-check.mjs" },
  "devDependencies": { "esbuild": "0.28.1" },
  "browser": {
    "./dist/crypto.js": "./dist/crypto.browser.js",
    "./dist/cryptoHash.js": "./dist/cryptoHash.browser.js",
    "./dist/native.js": "./dist/native.browser.js"
  }
}
JSON

  printf 'export interface SignedTransactionResult {}\nexport function buildTransferAssetInstruction(): void;\nexport class ToriiClient {}\nexport const IVM_PROGRAM_HEADER_LENGTH: 49;\n' > "$package_dir/index.d.ts"
  printf 'export interface BrowserConnectWallet { signTransaction(): Promise<Uint8Array>; }\n' > "$package_dir/connect.browser.d.ts"
  printf 'export const IVM_PROGRAM_HEADER_LENGTH: 49;\nexport const IVM_ARTIFACT_MAX_BYTES: 4194304;\nexport function computeIvmArtifactHashes(artifact: Uint8Array | ArrayBuffer | ArrayBufferView): { codeHashHex: string; artifactSha256Hex: string };\n' > "$package_dir/ivm-artifact.d.ts"
  printf 'import type { Buffer } from "buffer";\nexport interface NexusTransactionCodec { finalizeSignedTransaction(): void; bytes?: Buffer; }\nexport class NexusAppClient {}\nexport { validateBrowserTransferSignable } from "./transaction-codec.js";\n' > "$package_dir/nexus-app.d.ts"
  printf 'import type { Buffer } from "buffer";\nexport function buildCanonicalJsonRequest(): Promise<{ body: string }>;\nexport function canonicalRequestMessage(value: Buffer | ArrayBuffer | ArrayBufferView): Buffer;\n' > "$package_dir/canonical-request.d.ts"
  printf 'export const browserTransactionCodec: object;\nexport function validateBrowserTransferSignable(): object;\n' > "$package_dir/transaction-codec.d.ts"
  printf 'export { buildTransferAssetInstruction } from "./instructionBuilders.js";\nexport { ToriiBrowserClient } from "./toriiBrowserClient.js";\nexport { computeIvmArtifactHashes } from "./ivmArtifact.js";\n' > "$package_dir/dist/browser.js"
  printf 'export function getNativeBinding() { throw new Error("iroha_js_host is unavailable in browser builds."); }\n' > "$package_dir/dist/native.browser.js"
  cat > "$package_dir/dist/nexusApp.js" <<'JS'
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
  printf 'export function validateBrowserTransferSignable() {}\nconst canonicalNumeric = "has a non-canonical fractional trailing zero";\nexport const browserTransactionCodec = Object.freeze({ validateSignable: validateBrowserTransferSignable });\n' > "$package_dir/dist/transactionCodec.js"
  cp "$package_dir/dist/nexusApp.js" "$package_dir/src/nexusApp.js"
  cp "$package_dir/dist/transactionCodec.js" "$package_dir/src/transactionCodec.js"
  cat > "$package_dir/dist/cryptoHash.browser.js" <<'JS'
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2";
const SHA256_ALIASES = new Set(["sha256", "sha-256"]);
export function createHash() {
  const error = new Error("Digest already called");
  error.code = "ERR_CRYPTO_HASH_FINALIZED";
  return { digest: () => Buffer.from(sha256(new Uint8Array())) };
}
export function randomBytes(size) {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}
JS
  cp "$package_dir/dist/cryptoHash.browser.js" "$package_dir/src/cryptoHash.browser.js"
  printf 'export { createHash, randomBytes } from "node:crypto";\n' > "$package_dir/dist/cryptoHash.js"
  cp "$package_dir/dist/cryptoHash.js" "$package_dir/src/cryptoHash.js"
  cat > "$package_dir/dist/blake2b.js" <<'JS'
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
  cat > "$package_dir/dist/ivmArtifact.js" <<'JS'
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
  cp "$package_dir/dist/ivmArtifact.js" "$package_dir/src/ivmArtifact.js"
  printf 'import { Buffer } from "buffer";\nimport { createHash, randomBytes } from "./cryptoHash.js";\nexport function canonicalRequestMessage(value) { return createHash("sha256").update(Buffer.from(value)).digest(); }\nexport function buildCanonicalJsonRequest() { return randomBytes(16); }\n' > "$package_dir/dist/canonicalRequest.js"
  cp "$package_dir/dist/canonicalRequest.js" "$package_dir/src/canonicalRequest.js"
  cat > "$package_dir/scripts/bundle-size-check.mjs" <<'JS'
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

  for file in index toriiBrowserClient crypto.browser instructionBuilders transaction norito normalizers address; do
    printf 'export const marker = "%s";\n' "$file" > "$package_dir/dist/$file.js"
  done
  printf 'import { Buffer } from "buffer";\nimport { createHash } from "./cryptoHash.js";\nexport const marker = { Buffer, createHash };\n' > \
    "$package_dir/dist/instructionBuilders.js"
  printf 'import { Buffer } from "buffer";\nexport const marker = Buffer;\n' > \
    "$package_dir/dist/normalizers.js"
  printf 'import { Buffer } from "buffer";\nexport const marker = Buffer;\n' > \
    "$package_dir/dist/norito.js"
  cp "$package_dir/dist/instructionBuilders.js" "$package_dir/src/instructionBuilders.js"
  cp "$package_dir/dist/normalizers.js" "$package_dir/src/normalizers.js"
  cp "$package_dir/dist/norito.js" "$package_dir/src/norito.js"
}

write_fixture_repo() {
  local repo="$1"

  mkdir -p "$repo/scripts" "$repo/src"
  cp "$CHECK_IROHA_JS_SDK_SCRIPT" "$repo/scripts/check-iroha-js-sdk-artifact.sh"
  chmod +x "$repo/scripts/check-iroha-js-sdk-artifact.sh"
  printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=false\nVUE_APP_ENABLE_BITCOIN_TRANSFERS=false\n' > "$repo/.env.example"
  printf 'export const clean = true;\n' > "$repo/src/index.ts"

  (
    cd "$repo"
    git init -q
    git add .
  )
}

write_fake_gh() {
  local repo="$1"

  mkdir -p "$repo/fake-bin"
  cat > "$repo/fake-bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" != "release" || "$2" != "download" ]]; then
  echo "unexpected gh command: $*" >&2
  exit 1
fi

tag="$3"
shift 3
repo=""
pattern=""
download_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo="$2"
      shift 2
      ;;
    --pattern)
      pattern="$2"
      shift 2
      ;;
    --dir)
      download_dir="$2"
      shift 2
      ;;
    --clobber)
      shift
      ;;
    *)
      echo "unexpected gh argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ "$repo" == "${FAKE_IROHA_JS_RELEASE_REPO:-}" ]] || { echo "unexpected repo: $repo" >&2; exit 1; }
[[ "$tag" == "${FAKE_IROHA_JS_RELEASE_TAG:-}" ]] || { echo "unexpected tag: $tag" >&2; exit 1; }
[[ "$pattern" == "${FAKE_IROHA_JS_RELEASE_ASSET:-}" ]] || { echo "unexpected asset: $pattern" >&2; exit 1; }
[[ -n "$download_dir" ]] || { echo "missing download dir" >&2; exit 1; }

cp "$FAKE_IROHA_JS_RELEASE_ASSET_SOURCE" "$download_dir/$pattern"
EOF
  chmod +x "$repo/fake-bin/gh"
}

write_fixture_tarball() {
  local tarball="$1"
  local source_dir
  source_dir="$(dirname "$tarball")/iroha-js-release-src"

  mkdir -p "$source_dir/package"
  write_fixture_package "$source_dir/package"
  tar -czf "$tarball" -C "$source_dir" package
}

run_audit() {
  local repo="$1"
  shift

  (
    cd "$repo"
    "$@" bash "$AUDIT_SCRIPT"
  )
}

expect_failure() {
  local name="$1"
  local repo="$2"
  local expected="$3"
  shift 3
  local output

  set +e
  output="$(run_audit "$repo" "$@" 2>&1)"
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

VALID_REPO="$TMP_DIR/valid"
write_fixture_repo "$VALID_REPO"
run_audit "$VALID_REPO" env >/dev/null

LEGACY_HEADER_DECLARATION_REPO="$TMP_DIR/legacy-header-declaration"
write_fixture_repo "$LEGACY_HEADER_DECLARATION_REPO"
write_fixture_package "$LEGACY_HEADER_DECLARATION_REPO/iroha-js-package"
sed -i.bak 's/IVM_PROGRAM_HEADER_LENGTH: 49/IVM_PROGRAM_HEADER_LENGTH: 17/' \
  "$LEGACY_HEADER_DECLARATION_REPO/iroha-js-package/ivm-artifact.d.ts"
rm -f "$LEGACY_HEADER_DECLARATION_REPO/iroha-js-package/ivm-artifact.d.ts.bak"
expect_failure \
  "legacy 17-byte IVM header declaration" \
  "$LEGACY_HEADER_DECLARATION_REPO" \
  "ivm-artifact.d.ts must declare the exact 49-byte IVM V1 program header" \
  env IROHA_JS_SDK_PACKAGE_DIR="$LEGACY_HEADER_DECLARATION_REPO/iroha-js-package"

LEGACY_HEADER_RUNTIME_REPO="$TMP_DIR/legacy-header-runtime"
write_fixture_repo "$LEGACY_HEADER_RUNTIME_REPO"
write_fixture_package "$LEGACY_HEADER_RUNTIME_REPO/iroha-js-package"
for module in src/ivmArtifact.js dist/ivmArtifact.js; do
  sed -i.bak 's/IVM_PROGRAM_HEADER_LENGTH = 49/IVM_PROGRAM_HEADER_LENGTH = 17/' \
    "$LEGACY_HEADER_RUNTIME_REPO/iroha-js-package/$module"
  rm -f "$LEGACY_HEADER_RUNTIME_REPO/iroha-js-package/$module.bak"
done
expect_failure \
  "legacy 17-byte IVM header runtime" \
  "$LEGACY_HEADER_RUNTIME_REPO" \
  "dist/ivmArtifact.js must export the exact 49-byte IVM V1 program header" \
  env IROHA_JS_SDK_PACKAGE_DIR="$LEGACY_HEADER_RUNTIME_REPO/iroha-js-package"

LEGACY_BODY_HASH_REPO="$TMP_DIR/legacy-body-only-ivm-hash"
write_fixture_repo "$LEGACY_BODY_HASH_REPO"
write_fixture_package "$LEGACY_BODY_HASH_REPO/iroha-js-package"
for module in src/ivmArtifact.js dist/ivmArtifact.js; do
  node - "$LEGACY_BODY_HASH_REPO/iroha-js-package/$module" <<'NODE'
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
expect_failure \
  "legacy body-only IVM code hash" \
  "$LEGACY_BODY_HASH_REPO" \
  "must not use legacy or non-domain-separated IVM code hashing" \
  env IROHA_JS_SDK_PACKAGE_DIR="$LEGACY_BODY_HASH_REPO/iroha-js-package"

DOMAIN_NUL_REMOVED_REPO="$TMP_DIR/ivm-hash-domain-nul-removed"
write_fixture_repo "$DOMAIN_NUL_REMOVED_REPO"
write_fixture_package "$DOMAIN_NUL_REMOVED_REPO/iroha-js-package"
for module in src/ivmArtifact.js dist/ivmArtifact.js; do
  node - "$DOMAIN_NUL_REMOVED_REPO/iroha-js-package/$module" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
const canonical = 'iroha:ivm:contract-artifact:v1\\0';
if (!source.includes(canonical)) process.exit(2);
fs.writeFileSync(file, source.replace(canonical, 'iroha:ivm:contract-artifact:v1'));
NODE
done
expect_failure \
  "IVM code-hash domain NUL terminator removal" \
  "$DOMAIN_NUL_REMOVED_REPO" \
  "must encode the exact iroha:ivm:contract-artifact:v1\\0 code-hash domain once" \
  env IROHA_JS_SDK_PACKAGE_DIR="$DOMAIN_NUL_REMOVED_REPO/iroha-js-package"

DOMAIN_SEPARATION_REMOVED_REPO="$TMP_DIR/ivm-hash-domain-separation-removed"
write_fixture_repo "$DOMAIN_SEPARATION_REMOVED_REPO"
write_fixture_package "$DOMAIN_SEPARATION_REMOVED_REPO/iroha-js-package"
for module in src/ivmArtifact.js dist/ivmArtifact.js; do
  sed -i.bak 's/blake2b256(codeHashInput)/blake2b256(bytes)/' \
    "$DOMAIN_SEPARATION_REMOVED_REPO/iroha-js-package/$module"
  rm -f "$DOMAIN_SEPARATION_REMOVED_REPO/iroha-js-package/$module.bak"
done
expect_failure \
  "IVM code-hash domain separation removal" \
  "$DOMAIN_SEPARATION_REMOVED_REPO" \
  "must not use legacy or non-domain-separated IVM code hashing" \
  env IROHA_JS_SDK_PACKAGE_DIR="$DOMAIN_SEPARATION_REMOVED_REPO/iroha-js-package"

NEXUS_CAP_WEAKENED_REPO="$TMP_DIR/nexus-browser-cap-weakened"
write_fixture_repo "$NEXUS_CAP_WEAKENED_REPO"
write_fixture_package "$NEXUS_CAP_WEAKENED_REPO/iroha-js-package"
sed -i.bak 's/limitKb: 216/limitKb: 217/' \
  "$NEXUS_CAP_WEAKENED_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$NEXUS_CAP_WEAKENED_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "Nexus browser bundle cap weakening" \
  "$NEXUS_CAP_WEAKENED_REPO" \
  "Nexus browser target must retain the exact 216 KiB ceiling" \
  env IROHA_JS_SDK_PACKAGE_DIR="$NEXUS_CAP_WEAKENED_REPO/iroha-js-package"

LEGACY_NEXUS_CAP_REPO="$TMP_DIR/nexus-browser-legacy-cap"
write_fixture_repo "$LEGACY_NEXUS_CAP_REPO"
write_fixture_package "$LEGACY_NEXUS_CAP_REPO/iroha-js-package"
sed -i.bak 's/limitKb: 216/limitKb: 205/' \
  "$LEGACY_NEXUS_CAP_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$LEGACY_NEXUS_CAP_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "legacy 205 KiB Nexus browser cap" \
  "$LEGACY_NEXUS_CAP_REPO" \
  "Nexus browser target must retain the exact 216 KiB ceiling" \
  env IROHA_JS_SDK_PACKAGE_DIR="$LEGACY_NEXUS_CAP_REPO/iroha-js-package"

NEXUS_BASELINE_DRIFT_REPO="$TMP_DIR/nexus-browser-baseline-drift"
write_fixture_repo "$NEXUS_BASELINE_DRIFT_REPO"
write_fixture_package "$NEXUS_BASELINE_DRIFT_REPO/iroha-js-package"
sed -i.bak 's/215,950-byte/215,951-byte/' \
  "$NEXUS_BASELINE_DRIFT_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$NEXUS_BASELINE_DRIFT_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "Nexus browser reviewed baseline drift" \
  "$NEXUS_BASELINE_DRIFT_REPO" \
  "Nexus browser target must retain the audited pinned-esbuild contract" \
  env IROHA_JS_SDK_PACKAGE_DIR="$NEXUS_BASELINE_DRIFT_REPO/iroha-js-package"

AGGREGATE_CAP_WEAKENED_REPO="$TMP_DIR/public-aggregate-cap-weakened"
write_fixture_repo "$AGGREGATE_CAP_WEAKENED_REPO"
write_fixture_package "$AGGREGATE_CAP_WEAKENED_REPO/iroha-js-package"
sed -i.bak 's/limitKb: 328/limitKb: 329/' \
  "$AGGREGATE_CAP_WEAKENED_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$AGGREGATE_CAP_WEAKENED_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "public browser aggregate cap weakening" \
  "$AGGREGATE_CAP_WEAKENED_REPO" \
  "public browser aggregate must retain the exact 328 KiB ceiling" \
  env IROHA_JS_SDK_PACKAGE_DIR="$AGGREGATE_CAP_WEAKENED_REPO/iroha-js-package"

LEGACY_AGGREGATE_CAP_REPO="$TMP_DIR/public-aggregate-legacy-cap"
write_fixture_repo "$LEGACY_AGGREGATE_CAP_REPO"
write_fixture_package "$LEGACY_AGGREGATE_CAP_REPO/iroha-js-package"
sed -i.bak 's/limitKb: 328/limitKb: 300/' \
  "$LEGACY_AGGREGATE_CAP_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$LEGACY_AGGREGATE_CAP_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "legacy 300 KiB public browser aggregate cap" \
  "$LEGACY_AGGREGATE_CAP_REPO" \
  "public browser aggregate must retain the exact 328 KiB ceiling" \
  env IROHA_JS_SDK_PACKAGE_DIR="$LEGACY_AGGREGATE_CAP_REPO/iroha-js-package"

AGGREGATE_BASELINE_DRIFT_REPO="$TMP_DIR/public-aggregate-baseline-drift"
write_fixture_repo "$AGGREGATE_BASELINE_DRIFT_REPO"
write_fixture_package "$AGGREGATE_BASELINE_DRIFT_REPO/iroha-js-package"
sed -i.bak 's/314,580 bytes/314,581 bytes/' \
  "$AGGREGATE_BASELINE_DRIFT_REPO/iroha-js-package/scripts/bundle-size-check.mjs"
rm -f "$AGGREGATE_BASELINE_DRIFT_REPO/iroha-js-package/scripts/bundle-size-check.mjs.bak"
expect_failure \
  "public browser aggregate reviewed baseline drift" \
  "$AGGREGATE_BASELINE_DRIFT_REPO" \
  "public aggregate must retain the audited pinned-esbuild contract" \
  env IROHA_JS_SDK_PACKAGE_DIR="$AGGREGATE_BASELINE_DRIFT_REPO/iroha-js-package"

expect_failure \
  "env transfer enablement without reviewed codec artifact" \
  "$VALID_REPO" \
  "browser_transaction_codec_unpublished_source_only" \
  env VUE_APP_ENABLE_IROHA_TRANSFERS=true

expect_failure \
  "Bitcoin transfer enablement without funded broadcast evidence" \
  "$VALID_REPO" \
  "bitcoin_testnet_broadcast_evidence_missing" \
  env VUE_APP_ENABLE_BITCOIN_TRANSFERS=true

INVALID_VALUE_REPO="$TMP_DIR/invalid-value"
write_fixture_repo "$INVALID_VALUE_REPO"
printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=yes\n' > "$INVALID_VALUE_REPO/.env.example"
(
  cd "$INVALID_VALUE_REPO"
  git add .env.example
)
expect_failure \
  "invalid transfer enablement value" \
  "$INVALID_VALUE_REPO" \
  "invalid VUE_APP_ENABLE_IROHA_TRANSFERS=yes" \
  env

INVALID_BITCOIN_VALUE_REPO="$TMP_DIR/invalid-bitcoin-value"
write_fixture_repo "$INVALID_BITCOIN_VALUE_REPO"
printf 'VUE_APP_ENABLE_BITCOIN_TRANSFERS=yes\n' > "$INVALID_BITCOIN_VALUE_REPO/.env.example"
(
  cd "$INVALID_BITCOIN_VALUE_REPO"
  git add .env.example
)
expect_failure \
  "invalid Bitcoin transfer enablement value" \
  "$INVALID_BITCOIN_VALUE_REPO" \
  "invalid VUE_APP_ENABLE_BITCOIN_TRANSFERS=yes" \
  env

ENABLED_REPO="$TMP_DIR/enabled-with-sdk"
write_fixture_repo "$ENABLED_REPO"
printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=true\n' > "$ENABLED_REPO/.env.example"
write_fixture_package "$ENABLED_REPO/iroha-js-package"
(
  cd "$ENABLED_REPO"
  git add .env.example
)
expect_failure \
  "transfer enablement with pinned old package still blocked without reviewed codec artifact" \
  "$ENABLED_REPO" \
  "browser_transaction_codec_unpublished_source_only" \
  env IROHA_JS_SDK_PACKAGE_DIR="$ENABLED_REPO/iroha-js-package"

GITHUB_RELEASE_REPO="$TMP_DIR/enabled-with-github-release-sdk"
write_fixture_repo "$GITHUB_RELEASE_REPO"
write_fake_gh "$GITHUB_RELEASE_REPO"
github_asset="$GITHUB_RELEASE_REPO/iroha-js-release.tgz"
write_fixture_tarball "$github_asset"
github_sha="$(shasum -a 256 "$github_asset" | awk '{print $1}')"
(
  cd "$GITHUB_RELEASE_REPO"
  git add .env.example
)
run_audit "$GITHUB_RELEASE_REPO" env \
  PATH="$GITHUB_RELEASE_REPO/fake-bin:$PATH" \
  FAKE_IROHA_JS_RELEASE_REPO="hyperledger-iroha/iroha" \
  FAKE_IROHA_JS_RELEASE_TAG="v1.2.3" \
  FAKE_IROHA_JS_RELEASE_ASSET="iroha-js-release.tgz" \
  FAKE_IROHA_JS_RELEASE_ASSET_SOURCE="$github_asset" \
  IROHA_JS_SDK_RELEASE_REPO="hyperledger-iroha/iroha" \
  IROHA_JS_SDK_RELEASE_TAG="v1.2.3" \
  IROHA_JS_SDK_RELEASE_ASSET="iroha-js-release.tgz" \
  IROHA_JS_SDK_RELEASE_SHA256="$github_sha" >/dev/null

expect_failure \
  "partial GitHub release SDK artifact pin" \
  "$GITHUB_RELEASE_REPO" \
  "IROHA_JS_SDK_RELEASE_REPO, IROHA_JS_SDK_RELEASE_TAG, IROHA_JS_SDK_RELEASE_ASSET, and IROHA_JS_SDK_RELEASE_SHA256 are required together" \
  env IROHA_JS_SDK_RELEASE_REPO="hyperledger-iroha/iroha"

echo "[public-artifacts-audit-test] 19 modes passed (2 positive, 17 adversarial): clean-baseline,legacy-17-byte-declaration-blocked,legacy-17-byte-runtime-blocked,legacy-body-only-hash-blocked,domain-nul-removal-blocked,domain-separation-removal-blocked,nexus-cap-weakening-blocked,legacy-nexus-cap-blocked,nexus-baseline-drift-blocked,aggregate-cap-weakening-blocked,legacy-aggregate-cap-blocked,aggregate-baseline-drift-blocked,iroha-transfer-enablement-blocked,bitcoin-transfer-enablement-blocked,invalid-iroha-flag-blocked,invalid-bitcoin-flag-blocked,pinned-old-package-still-blocked,checksum-pinned-github-release,partial-release-pin-blocked"
