#!/usr/bin/env bash
set -euo pipefail

recipe=$(cd "$(dirname "$0")" && pwd)
wallet=$(cd "$recipe/../../.." && pwd)
source_repo=${1:?usage: bash rebuild.sh /path/to/polkadot-js/wasm}
revision=f55a3e75a2ab5408f6bf947f2ec9b294daef432d
image=ubuntu@sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289
name="f02-rebuild-$(date +%s)-$$"
git -C "$source_repo" cat-file -e "$revision^{commit}"
docker run --platform linux/amd64 -d --name "$name" "$image" sleep infinity >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
docker exec "$name" mkdir -p /src /recipe /cache
docker cp "$recipe/." "$name:/recipe/"
git -C "$source_repo" archive "$revision" | docker exec -i "$name" tar xf - -C /src
tar -C "$wallet" -cf - node_modules/@polkadot/{util,x-bigint,x-global,x-textdecoder,x-textencoder} node_modules/{bn.js,tslib} | docker exec -i "$name" tar --warning=no-unknown-keyword -xf - -C /src
if [[ -n ${F02_DOWNLOAD_CACHE:-} ]]; then
  awk '{print $1}' "$recipe"/{ubuntu-archives,tool-archives,crate-archives}.sha256 | sort -u | while read -r digest; do
    if [[ -f "$F02_DOWNLOAD_CACHE/$digest" ]]; then printf '%s\n' "$digest"; fi
  done | tar -C "$F02_DOWNLOAD_CACHE" -T - -cf - | docker exec -i "$name" tar --warning=no-unknown-keyword -xf - -C /cache
fi
docker exec "$name" bash /recipe/build.sh
