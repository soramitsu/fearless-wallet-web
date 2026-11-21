# Chrome 4.2.10 prebuilt crypto inventory (F02)

Inspected the production ZIP built from `b3e005c87c48d70481e8b60510f050ec33a715a7` with Node 24.19.0 and Yarn 4.17.0. `corepack yarn build:extension:zip` built and audited 328 files; ZIP SHA-256 `96d96f9271d27766d9fee82f3b752eb788eb41c3d73408717670e904fac24d9a`. This is an inventory, **not a release approval**.

| Package | Installed carrier → Chrome ZIP member(s) | Use | Declared source; licence | Payload SHA-256 |
| --- | --- | --- | --- | --- |
| `@polkadot/wasm-crypto-wasm@7.5.4` | `cjs/bytes.js` via `bundle.js` → `chunks/accounts.js` and `chunks/background-vendor/polkadot-api-BialP3F1.js` | Runtime. Both background entry points call `cryptoWaitReady()`. | `polkadot-js/wasm`; Apache-2.0 | `7edb3158a3ec97e5bd72f35476128a1c09273a109887fd445b366ad1ebc21b06` (decoded WASM, 335277 bytes) |
| `tiny-secp256k1@2.2.5` | `lib/secp256k1.wasm` via `lib/wasm_loader.browser.js` → `assets/secp256k1.wasm` | Runtime, Bitcoin transaction ECC (`src/util/bitcoinTransaction.ts`), not a fallback. | `bitcoinjs/tiny-secp256k1`; MIT | `d5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada` |
| `@polkadot/wasm-crypto-asmjs@7.5.4` | `cjs/data.js` via `bundle.js` → **not shipped** | Optional upstream fallback. The default `wasm-crypto-init/bundle.js` exports `wasm.js`, which passes `null` for asm; `both.js` is opt-in. | `polkadot-js/wasm`; Apache-2.0 | `71d5cb82afcfbfe28dcbcde570d102a52aaaaa2802cc905b251ad710fdfa9b1f` (installed JS) |

Exact `yarn.lock` archive checksums (not module hashes):

```
@polkadot/wasm-crypto-wasm   10/338b5d4b347116efa09aba7f27f1d13e84a4ef62680ab02e2c47bbd43180844434cf49f8c954528cbb8bebef69bdf101be33e3a6fe093efd3f5ab2245f5e7faf
tiny-secp256k1               10/b404bdf54bd023954a5ae5ef22f88e3833227ee217bfa37cba834067f13b049d534dc123a41eda8dc8c1a6afeeb971773ce50da9e160ecc8f10d90ff9f736ed5
@polkadot/wasm-crypto-asmjs  10/9e03f052b871bc9e33268b01025fe43789f2af40e4aabbe3b7d8348a0752001cd137c20ba66c58ee7d692e798d957024c7cbd0cbf1a8cf3e6baebbe67696e781
```

Scanned unpackaged files under `dist/extension/chrome` for binary WASM v1 magic, base64 strings (including after zlib/gzip inflation), asm module signatures and WebAssembly instantiation sites. Compared the asm.js carrier's 71 long base64 data segments with all shipped JS: no matches. The two embedded Polkadot copies inflate to identical bytes. The two `.wasm` files in `node_modules/@subwallet/keyring` and the toolchain WASMs in `@swc/wasm` and `@one-ini/wasm` are not additional modules in this ZIP. A `WebAssembly.Module` type check is not a module.

## Bitcoin build inputs

The npm `gitHead` matches the peeled `v2.2.5` tag: `aab0155201a66f84297f75edd2fbde6013f37b38`. The tag does not contain `lib/secp256k1.wasm`. The upstream `Makefile` target `make build-wasm` uses the checked-in `Cargo.lock`, Rust 1.81.0, `wasm32-unknown-unknown`, `RUSTFLAGS="-C link-args=-zstack-size=655360"` and Binaryen 114 `wasm-opt -O4 --strip-debug --strip-producers`; the Dockerfile specifies Clang 12. Match the Linux builder and C toolchain as well as Rust (`secp256k1-sys` compiles C). No source rebuild or signed binary-to-source attestation verified here. This requires a separate builder, not the legacy Polkadot toolchain.

## Polkadot source and experiment

The npm registry version records for both packages report `gitHead` `f55a3e75a2ab5408f6bf947f2ec9b294daef432d`, the exact `polkadot-js/wasm` tag `v7.5.4`. Neither record lists `dist.attestations`. `CHANGELOG.md` dates it to 9 December 2025; the checked-in `src/cjs/bytes.js` contains **zero bytes**, and the asm source carrier is a null stub. Comparing these stubs or the tarball checksum is not a Rust build comparison.

The Rust pin lives in `scripts/rust-version.sh`, not a `rust-toolchain` file. `packages/wasm-crypto/Cargo.lock` SHA-256: `eeed9365343815a082c759e0574947b7c745c4671f58caf85793c39aeb00c9c0`. Inspected `scripts/{build,build-wasm,install-build-deps,rust-version}.sh`, `scripts/pack-wasm-base.mjs`, `Cargo.toml` and `Xargo.toml`. Used the individual stages without changing the machine's default Rust or running upstream release/publish scripts. Xargo 0.3.26 (upstream does not pin it), rustc 1.63.0-nightly `43347397f`, `rust-src`, `wasm32-unknown-unknown`, release LTO and the `panic_immediate_abort` sysroot. Used upstream's macOS x86_64 tool archives: wasm-bindgen 0.2.79 (`9b0d40c7a`), Binaryen `version_105`.

Rebuild commands (absolute paths `SRC` = tag checkout, `BINDGEN` = wasm-bindgen executable, `BIN` = Binaryen `bin`, `WALLET` = wallet checkout; install the reviewed tools before running). Keep Xargo and Cargo state isolated. The packer uses `fflate@0.8.2` from upstream's lock, `zlibSync` level 9, then standard base64. `@polkadot/util` is used only for numeric log formatting.

```sh
rustup toolchain install nightly-2022-06-24 --profile minimal --component rust-src --target wasm32-unknown-unknown
cd "$SRC/packages/wasm-crypto"
export CC=/opt/homebrew/opt/llvm/bin/clang AR=/opt/homebrew/opt/llvm/bin/llvm-ar CARGO_BUILD_JOBS=1
export CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse CARGO_UNSTABLE_SPARSE_REGISTRY=true
rustup run nightly-2022-06-24 xargo build --target wasm32-unknown-unknown --release --locked
"$BINDGEN" target/wasm32-unknown-unknown/release/wasm.wasm --out-dir build-wasm --target web
"$BIN/wasm-opt" build-wasm/wasm_bg.wasm -Oz -o build-wasm/wasm_opt.wasm
cd "$SRC/packages"
mkdir -p wasm-crypto-wasm/build/cjs
PKG_NAME=wasm-crypto node ../scripts/pack-wasm-base.mjs
"$BIN/wasm2js" -Oz --output "$SRC/translated.js" wasm-crypto/build-wasm/wasm_opt.wasm
sed '/import {/d' "$SRC/translated.js" | sed '1,/var retasmFunc = /!d' | sed 's/var retasmFunc = .*/exports.asmJsInit = (wbg) => asmFunc(wbg);/g' > "$SRC/translated.cjs"
cd "$WALLET"
node --input-type=module -e 'import {wasmBytes} from "@polkadot/wasm-crypto-wasm"; import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1],wasmBytes)' "$SRC/package.wasm"
```

The last command uses the installed loader itself (`base64Decode` with `lenIn`, then `unzlibSync` with `lenOut`); `package.wasm` is **post-optimization**. Neither a pre-bindgen nor a pre-`wasm-opt` reference is published in the npm package.

### Results: the macOS build does not reproduce the npm binaries

| Stage | Source build SHA-256 | Published SHA-256 |
| --- | --- | --- |
| Rust `wasm.wasm` (416657 bytes locally) | `76cdf6f8d7e85cac52c8b26f866dc0e174afcdd1aa791b0c8d937d25e6f06bd2` | Not supplied |
| Bindgen `wasm_bg.wasm` (380099 bytes locally) | `94f21770a62db151292bb4d83c5ec59bec3ffb94ab642b9c5d603925406b19a3` | Not supplied |
| `wasm_opt.wasm` (334426 vs 335277 bytes) | `8b473df75b229a3bab5e2868026bde8eae4769c175bca87f5b0f877cd6979fcc` | `7edb3158a3ec97e5bd72f35476128a1c09273a109887fd445b366ad1ebc21b06` |
| zlib stream (168337 vs 168782 bytes) | `8cbab905ff7ee4616019a52eb8d0fbe1e85213ced8ed2daf770b1464b2e0bee4` | `15cd110a8ab8aa7e5801440b4afb3dd9c56c07c2369f9f8a39b788ccca0456e9` |
| Generated `cjs/bytes.js` | `1254a6074fd26a19d2dd28373ac6e1afe2335de70f966c169ed4aa4b78d12cee` | `f000922c66d9b5b2bece78a96785b60cb53c4a46545ad55c8373e30c9a2f0d07` |
| `wasm2js -Oz` + upstream CommonJS transform | `650d056852e96736634b2bb9b36a92f79b3e2e2bec0565dc256a96f1e4670de2` | `71d5cb82afcfbfe28dcbcde570d102a52aaaaa2802cc905b251ad710fdfa9b1f` |

- **Compiler:** `WebAssembly.Module.customSections(module, 'producers')` identifies `Ubuntu clang 18.1.3 (1ubuntu1)` in npm versus `Homebrew clang 23.1.5` locally. Both identify walrus 0.19.0 and wasm-bindgen 0.2.79 (`9b0d40c7a`). The upstream release workflow specifies `ubuntu-latest`; its Darwin build path selects unversioned Homebrew LLVM. These are real builder differences, not proof that the C compiler explains every byte.
- **Executable sections:** All 8 imports and 42 exports match by name, kind and order. The code section does not: 163584 bytes published vs 162159 built; the data section is 169517 vs 170030 bytes. The rebuilt module adds a data-count section and declares bulk-memory, reference-types, multivalue and nontrapping-fptoint in addition to the original mutable-globals and sign-ext. Stripping metadata cannot make the modules identical.
- **Encoding control:** Recompressing the *published decoded WASM* with fflate 0.8.2 at level 9 exactly reproduces its zlib bytes and, using the release year 2025, the complete JS carrier. The packer uses the wall-clock year; the 2026 header is an additional JS difference, not the reason for the WASM mismatch.
- **Translation control:** Feeding *published* optimized WASM to the upstream macOS Binaryen 105 `wasm2js` and the three sequential `sed` transformations yields `d3b58bb52276c8a14893f16494c88ae8862f8234e4f3a586de760ecdb0d89640`, still not the npm asm.js. The first differing lines assign heap loads to different local variables; subsequent instructions differ too. This isolates a downstream difference but does not establish nondeterminism or a behavioural defect.

### Disposition: F02 remains open

Do not patch Yarn to use this Mac artifact. It would replace executable signing and key-derivation code and change the declared WASM feature contract, not merely substitute a different wrapper. Matching imports and exports is not cryptographic equivalence. A repeatable replacement would also need a pinned builder and a verified clean rebuild; the vendored locked Rust dependencies alone occupied 139 MiB in this experiment. No package override, runtime change, lockfile change, or hash-only “provenance passed” gate was added.

**Shortest path to closure:** obtain the original Linux builder manifest/image digest (including Ubuntu Clang `18.1.3 (1ubuntu1)`, Xargo, and the Linux bindgen/Binaryen archives) and compare stage hashes with the recipe above, or obtain a verifiable publisher attestation covering the exact module hash, source revision and build inputs. If an independently maintained replacement is chosen instead, pin its entire source/build closure, verify a second clean rebuild, and run the signing, derivation, recovery and historical-wallet browser vectors before adopting it. Bitcoin requires independent evidence for its own module. The asm.js discrepancy is not a blocker for this particular Chrome ZIP unless its import graph changes.
