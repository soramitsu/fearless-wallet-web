#!/usr/bin/env bash
set -euo pipefail

recipe=$(cd "$(dirname "$0")" && pwd)
wallet=$(cd "$recipe/../../../.." && pwd)
repo=${1:?usage: bash rebuild.sh /path/to/bitcoinjs/tiny-secp256k1}
revision=aab0155201a66f84297f75edd2fbde6013f37b38
image=ubuntu@sha256:9a04f13b3f80ef056361e30868593b1cfd2279fe19e4081cb93a90bf56819d6a
expected=d5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada
installed="$wallet/node_modules/tiny-secp256k1/lib/secp256k1.wasm"
: "${DOCKER_HOST:?point DOCKER_HOST at the intended local Docker engine}"
unset DOCKER_CONTEXT
test "$(git -C "$repo" rev-parse 'v2.2.5^{commit}')" = "$revision"
test -f "$installed"

stage=$(mktemp -d)
container=
cleanup() {
  if [[ -n $container ]]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$stage"
}
trap cleanup EXIT
mkdir "$stage/downloads"
awk '{print $1, "https://archive.ubuntu.com/ubuntu/" $2}' "$recipe/../ubuntu-archives.sha256" >"$stage/inputs"
cat "$recipe/archives.sha256" >>"$stage/inputs"
fetch() {
  local digest=$1 url=$2 dest="$stage/downloads/${2##*/}"
  if [[ -n ${F02_DOWNLOAD_CACHE:-} && -f $F02_DOWNLOAD_CACHE/$digest ]]; then
    cp "$F02_DOWNLOAD_CACHE/$digest" "$dest"
  elif ! curl --fail --silent --show-error --location --retry 2 -o "$dest" "$url"; then
    [[ $url == https://archive.ubuntu.com/ubuntu/* ]] || return 1
    curl --fail --silent --show-error --location --retry 2 -o "$dest" \
      "https://snapshot.ubuntu.com/ubuntu/20261121T110000Z/${url#https://archive.ubuntu.com/ubuntu/}"
  fi
  printf '%s  %s\n' "$digest" "$dest" | shasum -a 256 --check --status
}
export -f fetch
export stage
xargs -n2 -P6 bash -ec 'fetch "$1" "$2"' _ <"$stage/inputs"

container=$(docker create --platform linux/amd64 --network none --name "f02-secp-rebuild-$$-$RANDOM" "$image" sleep infinity)
docker start "$container" >/dev/null
docker exec "$container" mkdir /src /recipe
docker cp "$stage/downloads" "$container:/downloads"
docker cp "$recipe/build.sh" "$container:/recipe/build.sh"
docker cp "$recipe/../vendor-checksums.mjs" "$container:/recipe/vendor-checksums.mjs"
git -C "$repo" archive "$revision" | docker exec -i "$container" tar xf - -C /src
docker exec "$container" bash /recipe/build.sh
docker cp "$container:/src/lib/secp256k1.wasm" "$stage/rebuilt.wasm"
shasum -a 256 "$stage/rebuilt.wasm" "$installed"
printf '%s  %s\n' "$expected" "$stage/rebuilt.wasm" | shasum -a 256 --check
cmp "$stage/rebuilt.wasm" "$installed"
