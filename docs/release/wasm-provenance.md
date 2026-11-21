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

## Bitcoin: F02 closed by reproduction

**The npm module used for Bitcoin signing is rebuilt byte for byte from the `v2.2.5` tag.** Its publisher built it on an Apple silicon Mac, with Rust 1.81.0 hosted on `aarch64-apple-darwin`. Upstream CI built the same tag on Linux, so its artifact differs from npm only in function order. On 21 November 2026 a native Apple silicon build with the unchanged `make build-wasm` produced `d5238297…`. A Linux container produced the same bytes once Cargo saw that host. No wallet dependency, runtime or lockfile changed.

| Builder | Rust output before wasm-opt | Optimized WASM (1,242,474 bytes unless noted) |
| --- | --- | --- |
| Apple silicon macOS, LLVM 18.1.8 Clang, Rust `aarch64-apple-darwin` (native) | `ca46aa807cb3ad9c4a06acf7e6ff8d5859db3090c55895bb2fbaf76fe9ea8045` (1,261,378 bytes) | `d5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada`, **identical to npm** |
| Ubuntu 24.04 amd64, Clang 18.1.3, Rust `x86_64-unknown-linux-gnu` | `8e0d0cf76f0a23c4617656be474d1b2eb8da3887324890c89a47f78d62d3cb42` (1,261,311 bytes) | `8c11a74b3f15a0ca502f2415646e17f9e32451bdb35b7f6fe788af4a177df48e`, identical to upstream CI |
| Ubuntu 24.04 arm64, Clang 18.1.3, Rust `aarch64-unknown-linux-gnu` | `babc81836dc3c702b908d2f7f619529512ac29309e5ef6e53d7c4d513b515f74` | `fa97d66bedc17471947da589b29dd405c60280e4c87fe504a24efbfa6f0bbcaf` |
| Ubuntu 24.04 amd64, Clang 18.1.3, Rust `x86_64-unknown-linux-musl` | `9d7dd223349f284c35782881e4672946a1c7c6a53caec84f065f331fc3833c56` | `6730acb543a800a0a3868f1e3222c94d069025101467d8cac8fbc4ca4e2fb854` |
| Debian Buster, Clang 12.0.1, Rust x86_64 GNU (upstream Dockerfile's compiler) | `aaf933ddc6b3f539e958a54a9c2ae50141db3543c43c6d5d5def26c161a969c6` (1,278,025 bytes) | `2dac7a0d7fbdc940bf02ff02a9ee4bd3eabfda3e090acf7bf3b46eb08a61a295` (1,258,834 bytes) |
| npm 2.2.5, installed package and Chrome ZIP member | Unpublished | `d5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada` |

The npm version record gives `gitHead` `aab0155201a66f84297f75edd2fbde6013f37b38`, the commit at the peeled `v2.2.5` tag. The tracked source tree is `d20dc9b331167ddba99af5071b5a9d02ef3ebdf9`. Its `Cargo.lock` (SHA-256 `dabb6bed278e321ffbce2a6b5a04cb1735178aa1f12a88325d3ec137bbc414ea`) pins cc 1.0.71 and secp256k1-sys 0.8.1. The latter compiles its bundled Bitcoin Core C sources. The published npm tarball (SHA-256 `f1b3668a9aab00e90b7eae9ef13c3e74186a7031cdf7f5fc8d02e27ec42c5a0a`) supplies the optimized WASM. The tag contains no compiled module and npm supplies no pre-optimization reference. [Tagged build files](https://github.com/bitcoinjs/tiny-secp256k1/tree/aab0155201a66f84297f75edd2fbde6013f37b38) · [npm version record](https://registry.npmjs.org/tiny-secp256k1/2.2.5)

The Makefile sets `RUSTFLAGS="-C link-args=-zstack-size=655360"` for `cargo build --target wasm32-unknown-unknown --release`, then calls `wasm-opt -O4 --strip-debug --strip-producers`. The tag pins Rust 1.81.0 in `rust-toolchain.toml`. The Dockerfile builds Binaryen 114 from source on Debian Buster with Clang 12 installed. The separate packaging workflow takes WASM built on `ubuntu-latest` with the official Linux Binaryen 114 binary and transfers it into `npm pack`. It has no publish step. The same-tree master run started at 17:57 UTC on 26 October 2026, after the 16:05 UTC npm publication. The run’s `wasm` artifact ZIP (SHA-256 `f604c092e5422f7471fd01089dd4738edc38aa59ddf619d86714d8e2cb4e4e5a`) contains the Clang 18 GNU result in the table. [Packaging workflow](https://github.com/bitcoinjs/tiny-secp256k1/blob/aab0155201a66f84297f75edd2fbde6013f37b38/.github/workflows/ci.yaml) · [Workflow run](https://github.com/bitcoinjs/tiny-secp256k1/actions/runs/40373492920) · [Registry publication time](https://registry.npmjs.org/tiny-secp256k1) That workflow's artifact is the Linux result above, so the npm publisher built the module elsewhere. A maintainer's npm account published the tarball with Node 20.19.4 and npm 10.8.2.

### Why the build host changes the module

Cargo hashes the output of `rustc -vV`, including its `host:` line, into each crate's `-C metadata`. That value seeds the symbol hashes of six functions the wallet crate instantiates: `generate_int32`, `get_context`, two `<&T as Debug>::fmt` and two `core::panicking::assert_failed`. rustc and the linker emit functions in an order that depends on those names. The raw modules from different hosts therefore differ in function, type and element-table order, and in the name section. Their data, imports and exports are identical. After `wasm-opt -O4`, the other hosts' modules differ from npm in at most two places: two Rust `core::fmt::Debug` integer formatter bodies in opposite slots (defined functions 0 and 3), and the first two element-table entries swapped (1, 4 became 4, 1). Every other byte matches. Formatters like these serve panic and error messages, not the secp256k1 arithmetic.

In one arm64 Ubuntu container (Rust 1.81.0 for aarch64 Linux, Clang 18.1.3, Binaryen 114), a `RUSTC` wrapper that changed only the `host:` line reproduced every row above:

- `x86_64-unknown-linux-gnu` gave `8e0d0cf7…`/`8c11a74b…`, the amd64 build and upstream CI.
- `x86_64-unknown-linux-musl` gave `9d7dd223…`/`6730acb5…`, the musl build.
- `aarch64-unknown-linux-gnu` gave `babc8183…`/`fa97d66b…`, the arm64 build.
- `aarch64-apple-darwin` gave `106115703e23d4b1afdc7f6139bb04514999912adf83e84e00cea394cfd4c6ee` (1,261,311 bytes) and then `d5238297…`, the npm module. This raw module equals the native macOS one in every section except `producers`, which names Ubuntu Clang 18.1.3 instead of LLVM Clang 18.1.8 and which `--strip-producers` removes.

Four repeated plain arm64 builds gave identical bytes, and so did a second `wasm-opt` run on each. The host lines `aarch64-unknown-linux-musl` and `x86_64-pc-windows-gnu` give upstream CI's module. `x86_64-apple-darwin` and `x86_64-pc-windows-msvc` give the arm64 module. `aarch64-pc-windows-msvc` gives the musl module. Only `aarch64-apple-darwin` among those tried gives npm's.

The C compiler version matters. With Clang 12, code grew to 142,115 bytes and data to 1,115,711 bytes (npm has 1,115,631 data bytes). The type, import, function, global and element sections also differ. The table, memory, export and target-feature sections match. Compiling Binaryen 114 from its tagged source with Buster GCC 8 (`cmake -DBUILD_TESTS=OFF . && make -j6 wasm-opt`) produced the same optimized bytes as the official Binaryen executable for **both** the Buster and Ubuntu GNU Rust inputs. This rules out that optimizer substitution as the cause of either mismatch.

The archiver matters too. On macOS, Apple's Clang 21 compiles for `wasm32`, but Apple's `ar` writes an archive index without the WebAssembly symbols. The linker then leaves every secp256k1 C function as an import, and `make` still succeeds with a 9,560-byte code section. The native replay therefore sets `AR=llvm-ar`.

### Replay

Both replays export the pinned Git object, verify every download hash, use the two checked crate archives offline, and run the unchanged `make build-wasm`. Rust identifies commit `eeb90cda1969383f56a2637cbd3037bdf598841c`, LLVM 18.1.7; the release manifest SHA-256 is `5596679723faf7e63772bacb1d0c898abaa51eb4ed193b328929d907c8c4bd5a`.

**Native, on an Apple silicon Mac** (the publisher's host). Rust 1.81.0 `aarch64-apple-darwin`, the official LLVM 18.1.8 macOS arm64 release (SHA-256 `4573b7f25f46d2a9c8882993f091c52f416c83271db6f5b213c93f0bd0346a10`; Clang and `llvm-ar` only) and the official Binaryen 114 arm64 macOS release. Only those tools and `/usr/bin:/bin` are on `PATH`. [Script](wasm-builder/tiny-secp256k1/rebuild-macos.sh) · [Archives](wasm-builder/tiny-secp256k1/macos-archives.sha256)

```sh
bash docs/release/wasm-builder/tiny-secp256k1/rebuild-macos.sh /path/to/bitcoinjs/tiny-secp256k1
```

**Linux container** (any Docker engine that runs linux/amd64). It uses the Ubuntu 24.04 amd64 manifest and Clang 18.1.3 packages of the Polkadot experiment below, with networking disabled. It builds twice: plainly, which must give upstream CI's `8c11a74b…`, then with Cargo seeing `host: aarch64-apple-darwin`, which must give `d5238297…` and equal the installed file. [Script](wasm-builder/tiny-secp256k1/rebuild.sh) · [Rust, Binaryen and crate archives](wasm-builder/tiny-secp256k1/archives.sha256) · [Ubuntu packages](wasm-builder/ubuntu-archives.sha256) · [Earlier Buster and musl inputs](wasm-builder/tiny-secp256k1/comparison-archives.sha256)

```sh
export DOCKER_HOST=unix:///path/to/a/local/docker.sock
bash docs/release/wasm-builder/tiny-secp256k1/rebuild.sh /path/to/bitcoinjs/tiny-secp256k1
```

Either script accepts `F02_DOWNLOAD_CACHE`, a directory of raw archives named by SHA-256.

**Offline wallet verification:** `corepack yarn verify:tiny-secp256k1-wasm` checks the installed package version and the SHA-256 of the `lib/secp256k1.wasm` that the browser loader imports. `corepack yarn test:crypto-dependency-shims` also runs its one-byte tamper test. `audit:chrome-release` now refuses a package that ships any WebAssembly file, whatever its name, whose SHA-256 is not a recorded source rebuild; the only such file today is `assets/secp256k1.wasm`. None of these needs Docker, Rust or network.

### Verification (21 November 2026)

With Node 24.19.0, Corepack Yarn 4.17.0 and `YARN_CHILD_CONCURRENCY` unset, on wallet code `951c95c00835e4c37ed3c7d22d908de8b4b659e7`, these commands exited 0:

```sh
bash docs/release/wasm-builder/tiny-secp256k1/rebuild-macos.sh ../tiny-secp256k1  # native; published digest and installed file matched
bash docs/release/wasm-builder/tiny-secp256k1/rebuild.sh ../tiny-secp256k1        # linux/amd64 under Rosetta; 8c11a74b… and d5238297… matched
corepack yarn verify:tiny-secp256k1-wasm
corepack yarn test:crypto-dependency-shims
corepack yarn test:chrome-release-audit          # 110 checks
corepack yarn test:prepare-chrome-release
corepack yarn test:development-dependency-guards
corepack yarn typecheck
corepack yarn lint:check                         # 0 errors, 37 warnings
corepack yarn build:extension:zip                # includes audit:chrome-release
```

Both replays ran in new temporary directories from a cache of the hash-checked archives. The audited 4.2.10 Chrome ZIP contains 328 files, 9,967,161 bytes, SHA-256 `d147640092c4cd19ce614fe7781c15d10dbe0874b5a866f213087cae8ac292bb`. Its only WebAssembly file, `assets/secp256k1.wasm`, is `d5238297…`. The `f02-secp-` containers and the Colima VM were removed afterwards. These results do not approve a wallet release.

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

### Disposition after the macOS experiment (superseded for Polkadot)

Do not patch Yarn to use this Mac artifact. It would replace executable signing and key-derivation code and change the declared WASM feature contract, not merely substitute a different wrapper. Matching imports and exports is not cryptographic equivalence. A repeatable replacement would also need a pinned builder and a verified clean rebuild; the vendored locked Rust dependencies alone occupied 139 MiB in this experiment. No package override, runtime change, lockfile change, or hash-only “provenance passed” gate was added.

### Linux result: F02 closed by reproduction for both Polkadot payloads

On 21 November 2026, a clean export of `f55a3e75a2ab5408f6bf947f2ec9b294daef432d` produced the exact 335277 bytes returned by the installed npm loader. Linux `wasm2js` also reproduced the entire published fallback, independently confirmed by feeding it the decoded npm module. No wallet dependency, runtime, or lockfile changed. The Bitcoin section above records that module's reproduction. These results do not approve a wallet release.

| Stage | Linux SHA-256 | Comparison with npm |
| --- | --- | --- |
| Rust (418632 bytes) | `b7bfb994c980c181b43fd68396daf7084705912873765c9d0be70045622b8662` | No published intermediate |
| Bindgen (381949 bytes) | `607e718d6f33ca84f9d92ab3b695d1639e8f79f018795aebed1ee72a54163d8a` | No published intermediate |
| Optimized WASM | `7edb3158a3ec97e5bd72f35476128a1c09273a109887fd445b366ad1ebc21b06` | Identical, including `producers`, `target_features`, code and data |
| zlib (168782 bytes) | `15cd110a8ab8aa7e5801440b4afb3dd9c56c07c2369f9f8a39b788ccca0456e9` | Identical |
| `cjs/bytes.js`, generated in 2026 | `bd134204f971ce054a6031717ecbd71236df6f98430ae8b05ecd412f720b9583` | Differs only in copyright year |
| `cjs/bytes.js`, year restored to 2025 | `f000922c66d9b5b2bece78a96785b60cb53c4a46545ad55c8373e30c9a2f0d07` | Identical |
| `cjs/data.js`, upstream `wasm2js -Oz` and CommonJS transform | `71d5cb82afcfbfe28dcbcde570d102a52aaaaa2802cc905b251ad710fdfa9b1f` | Identical; not shipped in this Chrome ZIP |

**Builder.** Ubuntu 24.04.5 amd64 under Rosetta, OCI index `sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289`, amd64 manifest `sha256:9a04f13b3f80ef056361e30868593b1cfd2279fe19e4081cb93a90bf56819d6a`. This is a sufficient builder, not a claim about the historical runner image digest. Both `clang-18` and `llvm-18` are `1:18.1.3-1ubuntu1`; `clang --version` reported `Ubuntu clang version 18.1.3 (1ubuntu1)`. Xargo 0.3.26, rustc `43347397f`, bindgen 0.2.79 Linux musl, Binaryen 105 Linux, fflate 0.8.2. `cc` 1.0.73 invoked `clang -Oz -ffunction-sections -fdata-sections -fPIC --target=wasm32-unknown-unknown` for secp256k1, then GNU `ar cq` and `ar s`; no custom `CC`, `AR`, `CFLAGS` or `RUSTFLAGS`. No alternative point release or Xargo was needed.

**Scope and inputs.** The experiment ran upstream `scripts/install-build-deps.sh` (including `rust-version.sh`) and `PKG_NAME=wasm-crypto ../scripts/build-wasm.sh`. It staged the two verified Linux tool archives and the packer's JS dependencies; it did not run upstream publication, Rollup or unrelated JS tests. The disposable VM's requested scratch bind mount appeared empty, so inputs were streamed to the named container. `wasm-builder/` contains SHA-256 inventories for the 99 apt archives, Cargo archives, Rust components, and downloaded tools. `tools.sha256` records executables from the first build; host tool hashes are observations, not substitutes for comparing payloads. The recipe pins Xargo and its dependencies rather than installing an unbounded future crates.io version.

**Repeat the source comparison** from the wallet checkout with its locked JS dependencies installed, Docker pointed at the intended engine, and a local `polkadot-js/wasm` checkout containing the recorded commit:

```sh
bash docs/release/wasm-builder/rebuild.sh /path/to/polkadot-js/wasm
```

The script exports the named Git object, not the upstream working tree. It copies only the wallet JS packages used for number formatting, runs a fresh `linux/amd64` container and removes it on exit. The builder downloads hash-pinned inputs; alternatively set `F02_DOWNLOAD_CACHE` to a directory of raw archives named by SHA-256. Only manifest-listed cache entries are transferred and every one is checked before use. A pass requires all four comparisons in `payloads.sha256`, not just a successful Rust build.

The final recipe was exercised in a second clean container with a partially warm download cache: no compiled Rust objects, Xargo sysroot or generated JS were reused. Both unpublished intermediate hashes matched the first experiment, and all four published comparisons passed. During recipe preparation, an apt local-file install failed, an incomplete vendor directory lacked `hermit-abi`, and apt's HTTPS helper escaped a literal `+` in a crate URL and received HTTP 403. These were real setup errors, fixed and retried, not evidence of a module difference or a load timeout.

**Offline wallet verification:** `corepack yarn verify:polkadot-wasm` checks the package version and hashes the bytes returned by its own loader. `corepack yarn test:crypto-dependency-shims` also runs the installed-module and one-byte tamper test. Neither requires Docker, Rust or network. The check covers the installed module, not the entire Chrome ZIP; the Bitcoin module has its own check above.

**Wallet validation (21 November 2026).** Wallet code `d8f19c4531989c9adafaa838b83426dc9191756c`, Node 24.19.0, Yarn 4.17.0. The initial Yarn invocations rejected the inherited legacy `YARN_CHILD_CONCURRENCY` before running any checks; after `unset YARN_CHILD_CONCURRENCY` all of these exited 0:

```sh
corepack yarn typecheck
corepack yarn lint:check                         # 0 errors, 37 warnings
corepack yarn verify:polkadot-wasm
node --test scripts/test-polkadot-wasm-provenance.mjs
corepack yarn test:crypto-dependency-shims
corepack yarn build:extension:zip
corepack yarn audit:chrome-release
```

The audited Chrome 4.2.10 ZIP contains 328 files, 9967069 bytes; SHA-256 `b5ddf998f4a79da7f36020fbc47426ac6cec7e252ffae8196050032e34d4f847`. The first post-build zlib inspection failed because Node treated the generated CommonJS `bytes.js` as ESM outside the packaged CJS directory; copying it unchanged to `/tmp/bytes.cjs` and decoding its base64 gave the matching stream hash in the table. Neither that inspection error nor a setup failure was counted as a payload mismatch.
