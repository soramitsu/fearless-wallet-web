#!/usr/bin/env bash
# Native replay on an Apple silicon Mac, the host that built npm tiny-secp256k1 2.2.5: builds the v2.2.5 tag with
# its unchanged `make build-wasm` and compares the module with the published digest and the installed copy.
set -euo pipefail

test "$(uname -s)/$(uname -m)" = Darwin/arm64
recipe=$(cd "$(dirname "$0")" && pwd)
wallet=$(cd "$recipe/../../../.." && pwd)
repo=${1:?usage: bash rebuild-macos.sh /path/to/bitcoinjs/tiny-secp256k1}
revision=aab0155201a66f84297f75edd2fbde6013f37b38
expected=d5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada
installed="$wallet/node_modules/tiny-secp256k1/lib/secp256k1.wasm"
llvm=clang+llvm-18.1.8-arm64-apple-macos11
test "$(git -C "$repo" rev-parse 'v2.2.5^{commit}')" = "$revision"
test -f "$installed"

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/downloads" "$stage/crates" "$stage/vendor" "$stage/cargo-home" "$stage/src" "$stage/tools"
while read -r digest url; do
  [[ -z $digest || $digest == \#* ]] && continue
  name=${url##*/}
  dest="$stage/downloads/${name//%2B/+}"
  if [[ -n ${F02_DOWNLOAD_CACHE:-} && -f $F02_DOWNLOAD_CACHE/$digest ]]; then
    cp "$F02_DOWNLOAD_CACHE/$digest" "$dest"
  else
    curl --fail --silent --show-error --location --retry 2 -o "$dest" "$url"
  fi
  printf '%s  %s\n' "$digest" "$dest" | shasum -a 256 --check --status
done <"$recipe/macos-archives.sha256"

cd "$stage/downloads"
for component in rustc-1.81.0-aarch64-apple-darwin cargo-1.81.0-aarch64-apple-darwin \
  rust-std-1.81.0-aarch64-apple-darwin rust-std-1.81.0-wasm32-unknown-unknown; do
  tar xJf "$component.tar.xz" -C "$stage/tools"
  "$stage/tools/$component/install.sh" --prefix="$stage/rust" --disable-ldconfig >/dev/null
done
tar xJf "$llvm.tar.xz" -C "$stage/tools" "$llvm/bin/clang" "$llvm/bin/clang-18" "$llvm/bin/llvm-ar" \
  "$llvm/lib/clang/18/include"
tar xzf binaryen-version_114-arm64-macos.tar.gz -C "$stage/tools"
mv ./*.crate "$stage/crates/"
for crate in "$stage/crates"/*.crate; do tar xzf "$crate" -C "$stage/vendor"; done
node "$recipe/../vendor-checksums.mjs" "$stage/crates" "$stage/vendor"
printf '%s\n' '[source.crates-io]' 'replace-with = "vendor"' \
  '[source.vendor]' "directory = \"$stage/vendor\"" >"$stage/cargo-home/config.toml"
git -C "$repo" archive "$revision" | tar xf - -C "$stage/src"

# Only the pinned tools are on PATH. AR selects LLVM's archiver: Apple's ar writes an archive index without the
# WebAssembly symbols, so the linker leaves every secp256k1 C function as an import and the build still "succeeds".
run() {
  env -i HOME="$stage" CARGO_HOME="$stage/cargo-home" CARGO_NET_OFFLINE=true AR=llvm-ar \
    PATH="$stage/rust/bin:$stage/tools/$llvm/bin:$stage/tools/binaryen-version_114/bin:/usr/bin:/bin" "$@"
}
cd "$stage/src"
run rustc -vV
run clang --version
run wasm-opt --version
shasum -a 256 Cargo.lock >"$stage/lock.sha256"
run make build-wasm
shasum -a 256 --check "$stage/lock.sha256"
shasum -a 256 target/wasm32-unknown-unknown/release/secp256k1_wasm.wasm lib/secp256k1.wasm "$installed"
printf '%s  %s\n' "$expected" lib/secp256k1.wasm | shasum -a 256 --check
cmp lib/secp256k1.wasm "$installed"
