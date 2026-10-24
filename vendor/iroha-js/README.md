# Vendored Iroha JavaScript SDK 0.0.3

`iroha-iroha-js-0.0.3.tgz` is `@iroha/iroha-js` 0.0.3 packed from the public
Hyperledger Iroha source:

- repository: <https://github.com/hyperledger-iroha/iroha>
- commit: `581c49d95995b57b2b0ef3245a6f11b01248ad08` (`optimizations`, 2026-10-21),
  path `javascript/iroha_js`
- bytes: `1,082,778`
- files/archive entries: `259`
- SHA-256: `1fefeae587873fed45821f4a59f7b5722eab72dcc161561ffa7ecdb97049dd41`

The wallet uses two browser entry points: `@iroha/iroha-js/transaction-codec`
(canonical transfer payloads, payload hashing and signed-transaction
finalization) and `NetworkId` from `@iroha/iroha-js/browser`. The SDK reaches
its Rust binding only to parse and render I105 account literals; the extension
build redirects that import to `src/util/irohaSdkBrowserBinding.ts`, which uses
the wallet's I105 codec. Every other native operation still fails closed.

This SDK encodes data model 4 with signed-transaction schema hash
`7ab5ff9c572efb316deac478f19209c5`, the format Taira reported on 2026-10-22
(`/v1/node/capabilities`). Transfers check that pair on the node before signing.

## Reproduce

With Node 24.19.0:

```sh
git -C <iroha checkout> archive 581c49d95995b57b2b0ef3245a6f11b01248ad08 javascript/iroha_js | tar -x -C <empty dir>
cd <empty dir>/javascript/iroha_js
npm ci
npm run build:dist
npm pack --ignore-scripts
```

`yarn audit:vendored-iroha-sdk` pins the archive bytes and digest, the export
surface the wallet imports, the SDK's fail-closed browser native shim, and that
the installed package matches the archive byte for byte.
