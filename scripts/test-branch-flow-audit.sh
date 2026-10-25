#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-branch-flow.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

write_valid_repo() {
  local repo="$1"
  mkdir -p "$repo/.github/workflows"

  cat > "$repo/.github/workflows/ci.yml" <<'EOF'
name: CI
on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master
EOF

  cat > "$repo/.github/workflows/branch-flow.yml" <<'EOF'
name: Branch Flow
on:
  pull_request:
jobs:
  validate:
    steps:
      - name: Validate PR target
        env:
          BASE_BRANCH: ${{ github.base_ref }}
          HEAD_BRANCH: ${{ github.head_ref }}
        run: |
          if [[ "$BASE_BRANCH" != "master" ]]; then
            echo "All pull requests must target master"
            exit 1
          fi
EOF

  cat > "$repo/.github/pull_request_template.md" <<'EOF'
## Target Branch

- [ ] This PR targets `master` from a short-lived branch

## Checklist

- [ ] Required review and CI checks pass before merging
EOF

  cat > "$repo/CONTRIBUTING.md" <<'EOF'
# Contributing

## Branch workflow

`master` is the only long-lived branch.
All normal work starts from `master` and is submitted back to `master`.
`master` is the releasable branch.
EOF
}

expect_pass() {
  local repo="$1"
  bash "$AUDIT_SCRIPT" "$repo" >/dev/null
}

expect_fail() {
  local repo="$1"
  local label="$2"
  local output="$TMP_DIR/$label.out"

  if bash "$AUDIT_SCRIPT" "$repo" >"$output" 2>&1; then
    echo "[branch-flow-audit-test] ERROR: expected failure for $label" >&2
    exit 1
  fi

  if ! grep -q "ERROR" "$output"; then
    echo "[branch-flow-audit-test] ERROR: $label failed without an audit error" >&2
    cat "$output" >&2
    exit 1
  fi
}

VALID_REPO="$TMP_DIR/valid"
write_valid_repo "$VALID_REPO"
expect_pass "$VALID_REPO"

STAGING_WORKFLOW_REPO="$TMP_DIR/staging-workflow"
write_valid_repo "$STAGING_WORKFLOW_REPO"
cat > "$STAGING_WORKFLOW_REPO/.github/workflows/ci.yml" <<'EOF'
name: CI
on:
  push:
    branches: [ develop, master, staging ]
EOF
expect_fail "$STAGING_WORKFLOW_REPO" "staging-workflow"

MISSING_BRANCH_FLOW_REPO="$TMP_DIR/missing-branch-flow"
write_valid_repo "$MISSING_BRANCH_FLOW_REPO"
rm "$MISSING_BRANCH_FLOW_REPO/.github/workflows/branch-flow.yml"
expect_fail "$MISSING_BRANCH_FLOW_REPO" "missing-branch-flow"

MISSING_CI_TARGET_REPO="$TMP_DIR/missing-ci-target"
write_valid_repo "$MISSING_CI_TARGET_REPO"
cat > "$MISSING_CI_TARGET_REPO/.github/workflows/ci.yml" <<'EOF'
name: CI
on:
  pull_request:
    branches:
      - master
EOF
expect_fail "$MISSING_CI_TARGET_REPO" "missing-ci-target"

UNRESTRICTED_MASTER_TEMPLATE_REPO="$TMP_DIR/unrestricted-master-template"
write_valid_repo "$UNRESTRICTED_MASTER_TEMPLATE_REPO"
cat > "$UNRESTRICTED_MASTER_TEMPLATE_REPO/.github/pull_request_template.md" <<'EOF'
## Target Branch

- [ ] This PR targets `develop`
- [ ] This PR targets `master`
EOF
expect_fail "$UNRESTRICTED_MASTER_TEMPLATE_REPO" "unrestricted-master-template"

# Exercise the actual workflow guard with both working and retired targets.
python3 - "$SCRIPT_DIR/../.github/workflows/branch-flow.yml" <<'PY'
import os
from pathlib import Path
import subprocess
import sys

workflow = Path(sys.argv[1]).read_text()
step = workflow.split("- name: Validate PR target\n", 1)[1]
script = step.split("        run: |\n", 1)[1]
script = "\n".join(line[10:] for line in script.splitlines())
for base, head, expected in [
    ("master", "feature/new-work", 0),
    ("master", "fix/regression", 0),
    ("master", "release/next", 0),
    ("master", "dependabot/npm/package", 0),
    ("develop", "feature/new-work", 1),
    ("stage", "release/next", 1),
    ("master", "master", 1),
]:
    result = subprocess.run(
        ["bash", "-c", script],
        env={**os.environ, "BASE_BRANCH": base, "HEAD_BRANCH": head},
        capture_output=True, text=True,
    )
    if result.returncode != expected:
        raise SystemExit(f"Unexpected branch guard result for {head} -> {base}: {result.stdout}{result.stderr}")
PY

echo "[branch-flow-audit-test] Branch flow audit self-test passed."
