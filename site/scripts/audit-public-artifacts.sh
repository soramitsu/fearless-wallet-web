#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'Public artifact audit failed: %s\n' "$1" >&2
  exit 1
}

tracked_files="$(mktemp)"
tmp_matches="$(mktemp)"
trap 'rm -f "$tracked_files" "$tmp_matches"' EXIT

git ls-files > "$tracked_files"

if grep -E '(^|/)(dist|build|coverage|\.nuxt|\.output|\.vercel|\.netlify)(/|$)' "$tracked_files" > "$tmp_matches"; then
  cat "$tmp_matches" >&2
  fail 'generated website build/deploy output is tracked'
fi

if grep -E '\.(pem|p12|pfx|key|keystore|jks)$' "$tracked_files" > "$tmp_matches"; then
  cat "$tmp_matches" >&2
  fail 'private key or signing artifact is tracked'
fi

if grep -E '(^|/)\.env($|\.|/)' "$tracked_files" | grep -Ev '^\.env\.example$' > "$tmp_matches"; then
  cat "$tmp_matches" >&2
  fail 'unexpected env file is tracked'
fi

if git grep -n -I -E -- '-----BEGIN (RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com|NUXT_[A-Z0-9_]*(TOKEN|SECRET|KEY)=' -- . ':!yarn.lock' > "$tmp_matches"; then
  cat "$tmp_matches" >&2
  fail 'tracked content contains private key material, OAuth client IDs, or Nuxt secrets'
fi

printf 'Public artifact audit passed.\n'
