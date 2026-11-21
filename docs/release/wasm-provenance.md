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
