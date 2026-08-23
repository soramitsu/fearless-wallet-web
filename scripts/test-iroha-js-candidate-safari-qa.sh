#!/usr/bin/env bash

set -euo pipefail
umask 077

ROOT_DIR="$(git rev-parse --show-toplevel)"
RUNNER="$ROOT_DIR/scripts/run-iroha-js-candidate-safari-qa.sh"
CONTRACT_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-contract.mjs"
EVIDENCE_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-evidence.mjs"
EVIDENCE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-candidate-safari-qa-evidence.mjs"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fearless-safari-qa-selftest.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

passed=0

fail() {
  printf '[iroha-safari-qa-selftest][error] %s\n' "$*" >&2
  exit 1
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
  local marker="$2"
  shift 2
  local output status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label unexpectedly passed"
  [[ "$output" == *"$marker"* ]] || {
    printf '%s\n' "$output" >&2
    fail "$label did not report expected marker: $marker"
  }
  passed=$((passed + 1))
}

expect_success "contract adversarial inventory" node "$CONTRACT_TEST"
expect_success "stored evidence adversarial inventory" node "$EVIDENCE_TEST"
expect_success "stored evidence verification" node "$EVIDENCE_VERIFIER"
expect_success "runner shell syntax" bash -n "$RUNNER"
expect_success "runner help" "$RUNNER" --help
expect_failure "unknown argument" "unknown argument" "$RUNNER" --attacker
expect_failure "invalid timeout" "requires an integer" "$RUNNER" --timeout-ms nope
expect_failure "Node preload rejection" "unsafe runtime environment variable" \
  env NODE_OPTIONS=--trace-warnings bash "$RUNNER" --help

fake_bin="$TMP_DIR/fake-bin"
marker="$TMP_DIR/fake-node-executed"
mkdir -p "$fake_bin"
printf '#!/bin/sh\nprintf invoked > "$IROHA_SAFARI_FAKE_NODE_MARKER"\nexit 99\n' > "$fake_bin/node"
chmod +x "$fake_bin/node"
expect_success "caller PATH hijack ignored" env \
  IROHA_SAFARI_FAKE_NODE_MARKER="$marker" PATH="$fake_bin:$PATH" bash "$RUNNER" --help
[[ ! -e "$marker" ]] || fail "caller PATH replacement executed"
passed=$((passed + 1))

expected=10
if [[ "$(uname -s)" == "Darwin" ]]; then
  compiled="$TMP_DIR/control.scpt"
  expect_success "AppleScript control compiles" osacompile -o "$compiled" \
    "$ROOT_DIR/scripts/iroha-js-candidate-safari-control.applescript"
  expected=11
fi

[[ "$passed" -eq "$expected" ]] ||
  fail "internal shell check inventory changed: expected $expected, found $passed"
printf '[iroha-safari-qa-selftest] %d checks passed.\n' "$passed"
