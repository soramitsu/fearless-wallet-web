#!/usr/bin/env bash
set -euo pipefail

test "$(dpkg --print-architecture)" = amd64
mkdir -p /downloads/{deb,tools,crates} /vendor /root/.cargo
fetch() {
  local digest=$1 url=$2 dest=$3
  if [[ -f /cache/$digest ]]; then
    cp "/cache/$digest" "$dest"
  elif [[ $url == https://* ]]; then
    curl --fail --location --retry 2 --silent --show-error "$url" --output "$dest"
  else
    /usr/lib/apt/apt-helper download-file "$url" "$dest" "SHA256:$digest"
  fi
  printf '%s  %s\n' "$digest" "$dest" | sha256sum --check --status
}
export -f fetch
xargs -n2 -P6 bash -ec 'dest="/downloads/deb/${2##*/}"; fetch "$1" "http://archive.ubuntu.com/ubuntu/$2" "$dest" || fetch "$1" "http://snapshot.ubuntu.com/ubuntu/20261121T110000Z/$2" "$dest"' _ </recipe/ubuntu-archives.sha256
DEBIAN_FRONTEND=noninteractive apt-get -o Dir::Etc::sourcelist=/dev/null -o Dir::Etc::sourceparts=- install -y --no-install-recommends /downloads/deb/*.deb
export PATH=/root/.cargo/bin:/usr/lib/llvm-18/bin:$PATH
clang --version | head -1 | grep -Fx 'Ubuntu clang version 18.1.3 (1ubuntu1)'
cd /downloads/tools
while read -r digest name; do
  case "$name" in
    rustup-init) base=https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu;;
    binaryen-*) base=https://github.com/WebAssembly/binaryen/releases/download/version_105;;
    wasm-bindgen-*) base=https://github.com/rustwasm/wasm-bindgen/releases/download/0.2.79;;
    xargo-*) base=https://static.crates.io/crates/xargo;;
    fflate-*) base=https://registry.npmjs.org/fflate/-;;
    *) base=https://static.rust-lang.org/dist/2022-06-24;;
  esac
  fetch "$digest" "$base/$name" "$PWD/$name"
done </recipe/tool-archives.sha256
export RUSTUP_DIST_SERVER=file:///opt/mirror RUSTUP_IO_THREADS=1
mkdir -p /opt/mirror/dist/2022-06-24 /root/.rustup/downloads
cp channel-rust-nightly.toml /opt/mirror/dist/2022-06-24/
sha256sum channel-rust-nightly.toml >/opt/mirror/dist/2022-06-24/channel-rust-nightly.toml.sha256
for file in *.tar.xz; do digest=$(sha256sum "$file"); cp "$file" "/root/.rustup/downloads/${digest%% *}"; done
chmod +x rustup-init
./rustup-init -y --profile minimal --default-toolchain none --no-modify-path
rustup set auto-self-update disable
tar xzf binaryen-*.tar.gz -C /src && mv /src/binaryen-version_105 /src/binaryen
tar xzf wasm-bindgen-*.tar.gz -C /src && mv /src/wasm-bindgen-0.2.79-x86_64-unknown-linux-musl /src/bindgen
mkdir -p /src/node_modules/fflate
tar xzf fflate-0.8.2.tgz --strip-components=1 -C /src/node_modules/fflate
cp xargo-0.3.26.crate /downloads/crates/
cd /downloads/crates
xargs -n2 -P6 bash -ec 'name=${2%-[0-9]*}; fetch "$1" "https://static.crates.io/crates/$name/$2" "$PWD/$2"' _ </recipe/crate-archives.sha256
for file in *.crate; do tar xzf "$file" -C /vendor; done
node /recipe/vendor-checksums.mjs
printf '%s\n' '[source.crates-io]' 'replace-with = "vendor"' '[source.vendor]' 'directory = "/vendor"' >/root/.cargo/config.toml
export CARGO_NET_OFFLINE=true CARGO_BUILD_JOBS=2
cd /src
source scripts/rust-version.sh
rustup toolchain install "$RUST_VER" -c rust-src -t wasm32-unknown-unknown
rustup default "$RUST_VER"
cargo install --offline --locked --path /vendor/xargo-0.3.26
cd packages
mkdir -p wasm-crypto-{asmjs,wasm}/build/cjs
PKG_NAME=wasm-crypto ../scripts/build-wasm.sh
cp wasm-crypto-wasm/build/cjs/bytes.js /tmp/bytes.cjs
node -e 'process.stdout.write(Buffer.from(require("/tmp/bytes.cjs").bytes,"base64"))' >/tmp/module.zlib
sed -E '1s/2019-[0-9]{4}/2019-2025/' /tmp/bytes.cjs >/tmp/bytes-2025.cjs
sha256sum wasm-crypto/target/wasm32-unknown-unknown/release/wasm.wasm wasm-crypto/build-wasm/wasm_bg.wasm /tmp/bytes.cjs
sha256sum --check /recipe/payloads.sha256
