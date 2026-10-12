#!/usr/bin/env bash
set -euo pipefail

# Installs the pinned Chrome for Testing (linux64) for the upgrade E2E on CI. Branded Chrome ignores
# --load-extension, so the E2E needs Chrome for Testing. The archive must match the SHA-256 recorded below
# before anything is extracted; Google publishes no checksum list for Chrome for Testing, so the value is the
# one a reviewer recorded from the first download of this exact URL. Until it is recorded the script refuses to run.
#
# Usage: bash scripts/upgrade-e2e/install-cft.sh            (writes chrome-path to $GITHUB_OUTPUT)
# Locally, Playwright's Chrome for Testing cache is used instead (scripts/upgrade-e2e/chrome.mjs resolveChrome).

CFT_VERSION="147.0.7727.15"
# Record with: curl -fsSLO "$CFT_URL" && sha256sum chrome-linux64.zip
# Downloaded from the pinned Google URL and SHA-256 verified on 2026-10-12.
CFT_LINUX64_SHA256="04883e331b31448d6255fa058f0e1c7e8657c004da1f8a1c04eb28855a37ec6c"
CFT_URL="https://storage.googleapis.com/chrome-for-testing-public/${CFT_VERSION}/linux64/chrome-linux64.zip"

fail() {
  echo "[install-cft] ERROR: $*" >&2
  exit 1
}

[[ -n "$CFT_LINUX64_SHA256" ]] || fail "no SHA-256 is recorded for ${CFT_URL}; record it in CFT_LINUX64_SHA256 before CI can run the upgrade E2E"
[[ "$CFT_LINUX64_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "CFT_LINUX64_SHA256 is not a SHA-256"

target="${RUNNER_TEMP:-$(mktemp -d)}/chrome-for-testing-${CFT_VERSION}"
mkdir -p "$target"
archive="$target/chrome-linux64.zip"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --output "$archive" "$CFT_URL"
actual="$(sha256sum "$archive" | awk '{ print $1 }')"
[[ "$actual" == "$CFT_LINUX64_SHA256" ]] || fail "SHA-256 mismatch for ${CFT_URL}: expected ${CFT_LINUX64_SHA256}, received ${actual}"
unzip -q "$archive" -d "$target"
chrome="$target/chrome-linux64/chrome"
[[ -x "$chrome" ]] || fail "no chrome binary in the archive"
"$chrome" --version
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "chrome-path=$chrome" >> "$GITHUB_OUTPUT"; fi
