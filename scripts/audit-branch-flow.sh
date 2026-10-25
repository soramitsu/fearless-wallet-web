#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
FAILURES=0

record_failure() {
  echo "[branch-flow-audit] ERROR: $*" >&2
  FAILURES=1
}

require_file() {
  local file="$1"
  local label="$2"

  if [[ ! -f "$file" ]]; then
    record_failure "$label is missing: ${file#$ROOT_DIR/}"
    return 1
  fi
}

require_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"

  if ! grep -Eq "$pattern" "$file"; then
    record_failure "$message in ${file#$ROOT_DIR/}"
  fi
}

scan_for_retired_branches() {
  local file="$1"
  local matches

  matches="$(grep -nE '(^|[^[:alnum:]_])(develop|stage|staging)([^[:alnum:]_]|$)' "$file" || true)"
  if [[ -n "$matches" ]]; then
    record_failure "retired branch reference found in ${file#$ROOT_DIR/}:"
    printf '%s\n' "$matches" >&2
  fi
}

if [[ ! -d "$ROOT_DIR" ]]; then
  record_failure "repo root does not exist: $ROOT_DIR"
fi

WORKFLOW_DIR="$ROOT_DIR/.github/workflows"
CI_WORKFLOW="$WORKFLOW_DIR/ci.yml"
BRANCH_FLOW_WORKFLOW="$WORKFLOW_DIR/branch-flow.yml"
PR_TEMPLATE="$ROOT_DIR/.github/pull_request_template.md"
CONTRIBUTING="$ROOT_DIR/CONTRIBUTING.md"

if [[ -d "$WORKFLOW_DIR" ]]; then
  while IFS= read -r -d '' workflow; do
    scan_for_retired_branches "$workflow"
  done < <(find "$WORKFLOW_DIR" -type f \( -name '*.yml' -o -name '*.yaml' \) -print0)
fi

if [[ -f "$CI_WORKFLOW" ]]; then
  require_pattern "$CI_WORKFLOW" '(^|[[:space:]])push:' "CI workflow must run on pushes"
  require_pattern "$CI_WORKFLOW" '(^|[[:space:]])pull_request:' "CI workflow must run on pull requests"
  require_pattern "$CI_WORKFLOW" '(^|[^[:alnum:]_])master([^[:alnum:]_]|$)' "CI workflow must include master"
fi

if [[ -f "$BRANCH_FLOW_WORKFLOW" ]]; then
  require_pattern "$BRANCH_FLOW_WORKFLOW" '(^|[[:space:]])pull_request:' "Branch Flow workflow must run on pull requests"
  require_pattern "$BRANCH_FLOW_WORKFLOW" 'BASE_BRANCH' "Branch Flow workflow must inspect the PR base branch"
  require_pattern "$BRANCH_FLOW_WORKFLOW" 'HEAD_BRANCH' "Branch Flow workflow must inspect the PR head branch"
  require_pattern "$BRANCH_FLOW_WORKFLOW" 'BASE_BRANCH.*!=.*"master"' "Branch Flow workflow must reject other targets"
  require_pattern "$BRANCH_FLOW_WORKFLOW" 'All pull requests must target master' "Branch Flow workflow must require master"
fi

if require_file "$PR_TEMPLATE" "pull request template"; then
  scan_for_retired_branches "$PR_TEMPLATE"
  require_pattern "$PR_TEMPLATE" 'targets `master`' "PR template must require master"
  require_pattern "$PR_TEMPLATE" 'Required review and local validation' "PR template must require review and local validation"
fi

if require_file "$CONTRIBUTING" "CONTRIBUTING.md"; then
  scan_for_retired_branches "$CONTRIBUTING"
  require_pattern "$CONTRIBUTING" 'only long-lived branch' "CONTRIBUTING.md must document the single main branch"
  require_pattern "$CONTRIBUTING" 'starts from `master`' "CONTRIBUTING.md must require normal work from master"
  require_pattern "$CONTRIBUTING" '`master` is the releasable branch' "CONTRIBUTING.md must keep master releasable"
fi

if [[ "$FAILURES" -ne 0 ]]; then
  exit 1
fi

echo "[branch-flow-audit] Branch flow audit passed."
