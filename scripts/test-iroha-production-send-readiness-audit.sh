#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node "$ROOT_DIR/scripts/test-iroha-send-readiness-audit.mjs"
