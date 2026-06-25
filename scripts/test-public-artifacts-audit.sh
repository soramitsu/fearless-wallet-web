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

  mkdir -p "$package_dir/dist" "$package_dir/native"

  cat > "$package_dir/package.json" <<'JSON'
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

  printf 'export interface SignedTransactionResult {}\nexport function buildTransferAssetInstruction(): void;\nexport class ToriiClient {}\n' > "$package_dir/index.d.ts"
  printf 'export interface BrowserConnectWallet { signTransaction(): Promise<Uint8Array>; }\n' > "$package_dir/connect.browser.d.ts"
  printf 'export interface NexusTransactionCodec { finalizeSignedTransaction(): void; }\nexport class NexusAppClient {}\n' > "$package_dir/nexus-app.d.ts"
  printf 'export { buildTransferAssetInstruction } from "./instructionBuilders.js";\nexport { ToriiBrowserClient } from "./toriiBrowserClient.js";\n' > "$package_dir/dist/browser.js"
  printf 'export function getNativeBinding() { throw new Error("iroha_js_host is unavailable in browser builds."); }\n' > "$package_dir/dist/native.browser.js"
  printf 'export class NexusAppClient {}\nexport function finalizeSignedTransaction() {}\n' > "$package_dir/dist/nexusApp.js"

  for file in index toriiBrowserClient crypto.browser instructionBuilders transaction norito address; do
    printf 'export const marker = "%s";\n' "$file" > "$package_dir/dist/$file.js"
  done
}

write_fixture_repo() {
  local repo="$1"

  mkdir -p "$repo/scripts" "$repo/src"
  cp "$CHECK_IROHA_JS_SDK_SCRIPT" "$repo/scripts/check-iroha-js-sdk-artifact.sh"
  chmod +x "$repo/scripts/check-iroha-js-sdk-artifact.sh"
  printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=false\n' > "$repo/.env.example"
  printf 'export const clean = true;\n' > "$repo/src/index.ts"

  (
    cd "$repo"
    git init -q
    git add .
  )
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

expect_failure \
  "env transfer enablement without SDK artifact" \
  "$VALID_REPO" \
  "VUE_APP_ENABLE_IROHA_TRANSFERS=true requires" \
  env VUE_APP_ENABLE_IROHA_TRANSFERS=true

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

ENABLED_REPO="$TMP_DIR/enabled-with-sdk"
write_fixture_repo "$ENABLED_REPO"
printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=true\n' > "$ENABLED_REPO/.env.example"
write_fixture_package "$ENABLED_REPO/iroha-js-package"
(
  cd "$ENABLED_REPO"
  git add .env.example
)
run_audit "$ENABLED_REPO" env IROHA_JS_SDK_PACKAGE_DIR="$ENABLED_REPO/iroha-js-package" >/dev/null

echo "[public-artifacts-audit-test] all tests passed"
