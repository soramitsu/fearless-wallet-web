#!/usr/bin/env bash
set -euo pipefail

test "$(dpkg --print-architecture)" = amd64
cd /downloads
DEBIAN_FRONTEND=noninteractive apt-get -o Dir::Etc::sourcelist=/dev/null -o Dir::Etc::sourceparts=- \
  install -y --no-install-recommends /downloads/*.deb
mkdir -p /opt/rust /vendor /downloads/crates /root/.cargo
for archive in *.tar.xz; do
  work=$(mktemp -d)
  tar xJf "$archive" -C "$work"
  "$work/${archive%.tar.xz}/install.sh" --prefix=/opt/rust --disable-ldconfig
  rm -r "$work"
done
tar xzf binaryen-version_114-x86_64-linux.tar.gz -C /opt binaryen-version_114/bin/wasm-opt
mv ./*.crate /downloads/crates/
for crate in /downloads/crates/*.crate; do tar xzf "$crate" -C /vendor; done
node /recipe/vendor-checksums.mjs
printf '%s\n' '[source.crates-io]' 'replace-with = "vendor"' \
  '[source.vendor]' 'directory = "/vendor"' >/root/.cargo/config.toml
ln -s /usr/bin/clang-18 /usr/bin/clang
export PATH=/opt/rust/bin:/opt/binaryen-version_114/bin:$PATH CARGO_NET_OFFLINE=true

cd /src
rustc -vV
clang --version
wasm-opt --version
sha256sum Cargo.lock >/tmp/lock.sha256
make build-wasm
sha256sum -c /tmp/lock.sha256
sha256sum target/wasm32-unknown-unknown/release/secp256k1_wasm.wasm lib/secp256k1.wasm
wc -c target/wasm32-unknown-unknown/release/secp256k1_wasm.wasm lib/secp256k1.wasm
