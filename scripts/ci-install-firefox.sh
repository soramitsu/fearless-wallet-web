#!/usr/bin/env bash
set -euo pipefail

# Installs the pinned Firefox runtime for the CI extension smoke straight from
# Mozilla's release archive. The repository Actions policy only allows
# GitHub-owned and verified actions, so browser-actions/setup-firefox turned
# every CI run into a startup_failure. The tarball must match the reviewed
# SHA-256 below and Mozilla's release SHA256SUMS before anything is extracted.

FIREFOX_VERSION="152.0.4"
FIREFOX_SHA256="cfbe0a66269f220c69809210eda55fee72f4798427e78181b7d0da14df44882f"
FIREFOX_ARCHIVE_PATH="linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.xz"
FIREFOX_RELEASE_URL="https://archive.mozilla.org/pub/firefox/releases/${FIREFOX_VERSION}"

usage() {
  cat <<EOF
Usage: bash scripts/ci-install-firefox.sh ${FIREFOX_VERSION}
       bash scripts/ci-install-firefox.sh --self-test

Downloads Firefox ${FIREFOX_VERSION} (${FIREFOX_ARCHIVE_PATH}), verifies the pinned SHA-256 and the
release SHA256SUMS entry, extracts it under \$RUNNER_TEMP, and writes firefox-path to \$GITHUB_OUTPUT.
EOF
}

fail() {
  echo "[ci-install-firefox] ERROR: $*" >&2
  exit 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

verify_archive() {
  local archive="$1"
  local sums="$2"
  local expected="$3"
  local archive_path="$4"
  local actual listed

  actual="$(sha256_of "$archive")"
  if [[ "$actual" != "$expected" ]]; then
    fail "SHA-256 mismatch for $archive_path: expected $expected, received $actual"
  fi

  listed="$(awk -v target="$archive_path" '$2 == target { print $1 }' "$sums")"
  if [[ -z "$listed" ]]; then
    fail "release SHA256SUMS has no entry for $archive_path"
  fi
  if [[ "$listed" == *$'\n'* ]]; then
    fail "release SHA256SUMS lists $archive_path more than once"
  fi
  if [[ "$listed" != "$expected" ]]; then
    fail "release SHA256SUMS lists $listed for $archive_path, expected the pinned $expected"
  fi
}

# Verification always precedes extraction; nothing is unpacked from an archive
# that failed either checksum.
install_from_files() {
  local archive="$1"
  local sums="$2"
  local expected="$3"
  local archive_path="$4"
  local destination="$5"
  local binary

  verify_archive "$archive" "$sums" "$expected" "$archive_path"

  mkdir -p "$destination"
  tar -xJf "$archive" -C "$destination"
  binary="$destination/firefox/firefox"
  if [[ ! -f "$binary" || ! -x "$binary" ]]; then
    fail "extracted archive has no executable firefox/firefox"
  fi
  printf '%s\n' "$binary"
}

write_firefox_path() {
  local binary="$1"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf 'firefox-path=%s\n' "$binary" >>"$GITHUB_OUTPUT"
  fi
  echo "[ci-install-firefox] Firefox ${FIREFOX_VERSION} installed at $binary"
}

download() {
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --retry 3 --output "$2" "$1"
}

install_pinned_firefox() {
  local requested="$1"
  local work_dir binary

  if [[ "$requested" != "$FIREFOX_VERSION" ]]; then
    fail "Firefox $requested is not pinned; this script only installs the reviewed $FIREFOX_VERSION"
  fi

  work_dir="${RUNNER_TEMP:-$(mktemp -d)}/firefox-${FIREFOX_VERSION}"
  rm -rf "$work_dir"
  mkdir -p "$work_dir"
  download "$FIREFOX_RELEASE_URL/$FIREFOX_ARCHIVE_PATH" "$work_dir/firefox.tar.xz"
  download "$FIREFOX_RELEASE_URL/SHA256SUMS" "$work_dir/SHA256SUMS"

  binary="$(install_from_files "$work_dir/firefox.tar.xz" "$work_dir/SHA256SUMS" "$FIREFOX_SHA256" \
    "$FIREFOX_ARCHIVE_PATH" "$work_dir/install")"
  write_firefox_path "$binary"
}

self_test() {
  local tmp_dir archive sums good_sha output checks=0
  SELF_TEST_DIR="$(mktemp -d)"
  trap 'rm -rf "$SELF_TEST_DIR"' EXIT
  tmp_dir="$SELF_TEST_DIR"

  mkdir -p "$tmp_dir/source/firefox"
  printf '#!/bin/sh\necho "Mozilla Firefox %s"\n' "$FIREFOX_VERSION" >"$tmp_dir/source/firefox/firefox"
  chmod +x "$tmp_dir/source/firefox/firefox"
  archive="$tmp_dir/firefox.tar.xz"
  tar -cJf "$archive" -C "$tmp_dir/source" firefox
  good_sha="$(sha256_of "$archive")"
  sums="$tmp_dir/SHA256SUMS"
  printf '%s  %s\n%s  %s\n' \
    "0000000000000000000000000000000000000000000000000000000000000000" "linux-x86_64/de/firefox-${FIREFOX_VERSION}.tar.xz" \
    "$good_sha" "$FIREFOX_ARCHIVE_PATH" >"$sums"

  expect_rejected() {
    local label="$1"
    local pattern="$2"
    local destination="$3"
    shift 3

    if output="$("$@" 2>&1)"; then
      fail "self-test $label unexpectedly succeeded"
    fi
    if ! grep -Eq "$pattern" <<<"$output"; then
      fail "self-test $label failed for the wrong reason: $output"
    fi
    if [[ -e "$destination" ]]; then
      fail "self-test $label extracted files before verification failed"
    fi
    checks=$((checks + 1))
  }

  expect_rejected "wrong pinned checksum" "SHA-256 mismatch" "$tmp_dir/wrong-pin" \
    install_from_files "$archive" "$sums" "${good_sha%?}0" "$FIREFOX_ARCHIVE_PATH" "$tmp_dir/wrong-pin"

  printf '%s  %s\n' "${good_sha%?}0" "$FIREFOX_ARCHIVE_PATH" >"$tmp_dir/SHA256SUMS.disagree"
  expect_rejected "release sums disagree" "lists .* expected the pinned" "$tmp_dir/disagree" \
    install_from_files "$archive" "$tmp_dir/SHA256SUMS.disagree" "$good_sha" "$FIREFOX_ARCHIVE_PATH" "$tmp_dir/disagree"

  printf '%s  %s\n' "$good_sha" "linux-x86_64/en-US/firefox-0.0.1.tar.xz" >"$tmp_dir/SHA256SUMS.missing"
  expect_rejected "release sums missing entry" "has no entry" "$tmp_dir/missing" \
    install_from_files "$archive" "$tmp_dir/SHA256SUMS.missing" "$good_sha" "$FIREFOX_ARCHIVE_PATH" "$tmp_dir/missing"

  cat "$sums" "$sums" >"$tmp_dir/SHA256SUMS.duplicate"
  expect_rejected "release sums duplicate entry" "more than once" "$tmp_dir/duplicate" \
    install_from_files "$archive" "$tmp_dir/SHA256SUMS.duplicate" "$good_sha" "$FIREFOX_ARCHIVE_PATH" "$tmp_dir/duplicate"

  expect_rejected "unpinned version" "is not pinned" "$tmp_dir/unpinned" \
    env RUNNER_TEMP="$tmp_dir/unpinned" bash "$0" 152.0.3

  output="$(install_from_files "$archive" "$sums" "$good_sha" "$FIREFOX_ARCHIVE_PATH" "$tmp_dir/good")"
  if [[ "$output" != "$tmp_dir/good/firefox/firefox" || "$("$output")" != "Mozilla Firefox $FIREFOX_VERSION" ]]; then
    fail "self-test verified archive did not extract an executable firefox/firefox"
  fi
  checks=$((checks + 1))

  GITHUB_OUTPUT="$tmp_dir/github-output" write_firefox_path "$output" >/dev/null
  if [[ "$(cat "$tmp_dir/github-output")" != "firefox-path=$output" ]]; then
    fail "self-test did not write firefox-path to GITHUB_OUTPUT"
  fi
  checks=$((checks + 1))

  if [[ ! "$FIREFOX_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
    fail "pinned FIREFOX_SHA256 is not a lowercase SHA-256 digest"
  fi
  checks=$((checks + 1))

  echo "[ci-install-firefox] Self-test passed ($checks checks)."
}

case "${1:-}" in
  --self-test) self_test ;;
  -h | --help) usage ;;
  "") usage >&2; exit 2 ;;
  *) install_pinned_firefox "$1" ;;
esac
