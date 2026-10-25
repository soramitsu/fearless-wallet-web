#!/usr/bin/env bash
set -euo pipefail

# Iroha (Taira) send release gate; see scripts/audit-iroha-send-readiness.mjs.
ROOT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node "$ROOT_DIR/scripts/audit-iroha-send-readiness.mjs" "$@"
