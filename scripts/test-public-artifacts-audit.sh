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

GITHUB_RELEASE_REPO="$TMP_DIR/enabled-with-github-release-sdk"
write_fixture_repo "$GITHUB_RELEASE_REPO"
write_fake_gh "$GITHUB_RELEASE_REPO"
printf 'VUE_APP_ENABLE_IROHA_TRANSFERS=true\n' > "$GITHUB_RELEASE_REPO/.env.example"
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

echo "[public-artifacts-audit-test] all tests passed"
