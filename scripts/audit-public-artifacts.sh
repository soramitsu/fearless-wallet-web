#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

fail() {
  printf 'Public artifact audit failed: %s\n' "$1" >&2
  exit 1
}

tracked_files="$(mktemp)"
trap 'rm -f "$tracked_files"' EXIT

git ls-files > "$tracked_files"

if grep -E '(^|/)(dist|coverage|chrome|firefox|build)(/|$)' "$tracked_files" >/tmp/fearless-web-audit-generated.$$; then
  cat /tmp/fearless-web-audit-generated.$$ >&2
  rm -f /tmp/fearless-web-audit-generated.$$
  fail 'generated build output is tracked'
fi
rm -f /tmp/fearless-web-audit-generated.$$

if grep -E '\.(pem|p12|pfx|key|keystore|jks|mobileprovision|crx)$' "$tracked_files" >/tmp/fearless-web-audit-keys.$$; then
  cat /tmp/fearless-web-audit-keys.$$ >&2
  rm -f /tmp/fearless-web-audit-keys.$$
  fail 'private key, signing, or packed extension artifact is tracked'
fi
rm -f /tmp/fearless-web-audit-keys.$$

if grep -E '(^|/)\.env($|\.|/)' "$tracked_files" | grep -Ev '^\.env\.(example|extension|web)$' >/tmp/fearless-web-audit-env.$$; then
  cat /tmp/fearless-web-audit-env.$$ >&2
  rm -f /tmp/fearless-web-audit-env.$$
  fail 'unexpected env file is tracked'
fi
rm -f /tmp/fearless-web-audit-env.$$

if git grep -n -I -E -- '-----BEGIN (RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com' -- . ':!yarn.lock' >/tmp/fearless-web-audit-content.$$; then
  cat /tmp/fearless-web-audit-content.$$ >&2
  rm -f /tmp/fearless-web-audit-content.$$
  fail 'tracked content contains private key material or OAuth client IDs'
fi
rm -f /tmp/fearless-web-audit-content.$$

iroha_transfers_enabled=false
if [[ "${VUE_APP_ENABLE_IROHA_TRANSFERS:-}" == "true" ]]; then
  iroha_transfers_enabled=true
fi

iroha_connect_enabled=false
if [[ "${VUE_APP_ENABLE_IROHA_CONNECT:-}" == "true" ]]; then
  iroha_connect_enabled=true
fi

iroha_js_github_release_configured=false
if [[ -n "${IROHA_JS_SDK_RELEASE_REPO:-}" || -n "${IROHA_JS_SDK_RELEASE_TAG:-}" || -n "${IROHA_JS_SDK_RELEASE_ASSET:-}" || -n "${IROHA_JS_SDK_RELEASE_SHA256:-}" ]]; then
  if [[ -z "${IROHA_JS_SDK_RELEASE_REPO:-}" || -z "${IROHA_JS_SDK_RELEASE_TAG:-}" || -z "${IROHA_JS_SDK_RELEASE_ASSET:-}" || -z "${IROHA_JS_SDK_RELEASE_SHA256:-}" ]]; then
    fail 'IROHA_JS_SDK_RELEASE_REPO, IROHA_JS_SDK_RELEASE_TAG, IROHA_JS_SDK_RELEASE_ASSET, and IROHA_JS_SDK_RELEASE_SHA256 are required together'
  fi
  iroha_js_github_release_configured=true
fi

for env_file in .env.example .env.extension .env.web; do
  [[ -f "$env_file" ]] || continue

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *"="* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')"

    [[ -n "$value" ]] || continue

    if [[ "$key" == "VUE_APP_ENABLE_IROHA_TRANSFERS" ]]; then
      if [[ "$value" != "true" && "$value" != "false" ]]; then
        fail "$env_file contains invalid VUE_APP_ENABLE_IROHA_TRANSFERS=$value; expected true or false"
      fi

      if [[ "$value" == "true" ]]; then
        iroha_transfers_enabled=true
      fi
    fi

    # Bitcoin and Solana sends ship enabled (local regtest and
    # solana-test-validator E2E plus the remote veto-only kill switch); the
    # flags must still be an exact boolean.
    if [[ "$key" == "VUE_APP_ENABLE_BITCOIN_TRANSFERS" || "$key" == "VUE_APP_ENABLE_SOLANA_TRANSFERS" ]]; then
      if [[ "$value" != "true" && "$value" != "false" ]]; then
        fail "$env_file contains invalid $key=$value; expected true or false"
      fi
    fi

    if [[ "$key" == "VUE_APP_ENABLE_IROHA_CONNECT" ]]; then
      if [[ "$value" != "true" && "$value" != "false" ]]; then
        fail "$env_file contains invalid VUE_APP_ENABLE_IROHA_CONNECT=$value; expected true or false"
      fi

      if [[ "$value" == "true" ]]; then
        iroha_connect_enabled=true
      fi
    fi

    if [[ "$key" =~ (^|_)(API.*KEY|API_?KEY|SECRET|TOKEN|PRIVATE_?KEY|CLIENT_?SECRET|OAUTH_?CLIENT_?ID|EXTENSION_?PUBLIC_?KEY|MNEMONIC|SEED|PASSWORD)$ ]]; then
      fail "$env_file contains a non-empty sensitive value for $key"
    fi
  done < "$env_file"
done

if [[ "$iroha_transfers_enabled" == "true" ]]; then
  fail 'VUE_APP_ENABLE_IROHA_TRANSFERS=true is blocked: browser codec source exists locally, but no reviewed immutable release artifact is published, pinned, and bundled (browser_transaction_codec_unpublished_source_only)'
fi

if [[ "$iroha_connect_enabled" == "true" ]]; then
  fail 'VUE_APP_ENABLE_IROHA_CONNECT=true is blocked: IrohaConnect signs dApp-supplied bytes it does not decode (iroha_connect_blind_signing_unreviewed)'
fi

./scripts/check-iroha-js-sdk-artifact.sh --self-test

if [[ -n "${IROHA_JS_SDK_TARBALL:-}" ]]; then
  ./scripts/check-iroha-js-sdk-artifact.sh --tarball "$IROHA_JS_SDK_TARBALL"
elif [[ -n "${IROHA_JS_SDK_PACKAGE_DIR:-}" ]]; then
  ./scripts/check-iroha-js-sdk-artifact.sh --package-dir "$IROHA_JS_SDK_PACKAGE_DIR"
elif [[ "$iroha_js_github_release_configured" == "true" ]]; then
  ./scripts/check-iroha-js-sdk-artifact.sh \
    --github-release \
    --repo "$IROHA_JS_SDK_RELEASE_REPO" \
    --tag "$IROHA_JS_SDK_RELEASE_TAG" \
    --asset "$IROHA_JS_SDK_RELEASE_ASSET" \
    --sha256 "$IROHA_JS_SDK_RELEASE_SHA256"
elif [[ -n "${IROHA_JS_SDK_VERSION:-}" ]]; then
  ./scripts/check-iroha-js-sdk-artifact.sh --download --version "$IROHA_JS_SDK_VERSION" --registry "${IROHA_JS_SDK_REGISTRY:-https://registry.npmjs.org/}"
fi

printf 'Public artifact audit passed.\n'
