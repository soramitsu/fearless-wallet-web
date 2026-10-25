#!/usr/bin/env bash

set -euo pipefail
umask 077

for unsafe_variable in \
  NODE_OPTIONS NODE_PATH npm_config_node_options NPM_CONFIG_NODE_OPTIONS \
  DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH BASH_ENV ENV; do
  if [[ -n "${!unsafe_variable:-}" ]]; then
    printf 'Iroha Safari QA failed: unsafe runtime environment variable is set: %s\n' \
      "$unsafe_variable" >&2
    exit 1
  fi
done
unset NODE_OPTIONS NODE_PATH npm_config_node_options NPM_CONFIG_NODE_OPTIONS
unset DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH BASH_ENV ENV CDPATH

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" || "$NODE_BIN" != /* ]]; then
  printf 'Iroha Safari QA failed: a canonical absolute Node installation is required\n' >&2
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/run-iroha-js-candidate-safari-qa.mjs" "$@"
