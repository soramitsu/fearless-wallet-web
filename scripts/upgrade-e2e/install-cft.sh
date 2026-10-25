#!/usr/bin/env bash
set -euo pipefail

# Installs the pinned Chrome for Testing (linux64) for the upgrade E2E on CI. Branded Chrome ignores
# --load-extension, so the E2E needs Chrome for Testing. The archive must match the SHA-256 recorded below
# before anything is extracted; Google publishes no checksum list for Chrome for Testing, so the value is the
# one a reviewer recorded from the first download of this exact URL. Until it is recorded the script refuses to run.
#
# Usage: bash scripts/upgrade-e2e/install-cft.sh [--install-sandbox]
# The explicit Linux CI option installs the matching verified helper into a protected root-owned directory.
# Writes chrome-path (and sandbox-path when requested) to $GITHUB_OUTPUT.
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

install_sandbox=false
if [[ $# -gt 0 ]]; then
  [[ $# -eq 1 && "$1" == '--install-sandbox' ]] || fail 'usage: install-cft.sh [--install-sandbox]'
  [[ "$(uname -s)" == Linux ]] || fail '--install-sandbox is only supported on the disposable Linux CI runner'
  install_sandbox=true
fi

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
if [[ "$install_sandbox" == true ]]; then
  sandbox_source="$target/chrome-linux64/chrome_sandbox"
  [[ -f "$sandbox_source" && ! -L "$sandbox_source" && -x "$sandbox_source" ]] || fail 'no regular executable chrome_sandbox in the verified archive'
  sandbox_dir="/usr/local/libexec/fearless-chrome-${CFT_VERSION}"
  sandbox="$sandbox_dir/chrome-sandbox"
  # No download or unverified executable is run as root. The archive hash was
  # checked before extraction; only its matching helper receives setuid mode.
  sudo install -d -o root -g root -m 0755 "$sandbox_dir"
  sudo install -o root -g root -m 4755 "$sandbox_source" "$sandbox"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "sandbox-path=$sandbox" >> "$GITHUB_OUTPUT"; fi
fi
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "chrome-path=$chrome" >> "$GITHUB_OUTPUT"; fi
