# Chrome transfer-test candidate

This is a deliberately non-Store Chrome extension for manual Bitcoin testnet
send testing and Iroha compatibility testing. It is separate from the normal
3.0.6 Store artifact.

## Dedicated identity

- visible name: `Fearless Wallet Transfer Test`
- short name: `FW Test`
- Chrome manifest version: `0.0.0.306`
- extension ID: `aaohenakjkjcnnhgofihmnndeejaadbg`
- Google OAuth: absent
- Google Drive backup: unavailable in this test extension

The dedicated public key prevents the test extension from sharing the Store
ID. Its manifest version is lower than the published Store version 3.0.5, so it
cannot be accepted as an update to the Store listing. No Safari or Google login
is needed to build or run it.

## Exact policy

The production-mode test build compiles these values:

- `VUE_APP_TRANSFER_TESTING=true`
- `VUE_APP_ENABLE_BITCOIN_TRANSFERS=true`
- `VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY=testnet-only`
- `VUE_APP_ENABLE_IROHA_TRANSFERS=true`
- `VUE_APP_IROHA_TRANSFER_COMPATIBILITY=legacy-offline-only`
- `VUE_APP_EXTENSION_SMOKE=false`
- `VUE_APP_TEST_ONLY=false`

The artifact audit verifies every value from
`extension-build-metadata.json`, its dedicated identity, the absence of Store
OAuth, the Bitcoin testnet guard, the Iroha offline-only guard, and the bundled
candidate codec marker.

## Build and output

From a clean commit with the existing ignored Chrome release environment:

```sh
yarn env-cmd -f .env.chrome-release.local -- yarn prepare:chrome-transfer-test
```

The verified outputs are:

- `dist/extension/chrome-transfer-test/fearless-wallet-extension-chrome-transfer-test.zip`
- `dist/extension/chrome-transfer-test-provenance.json`

For a local rebuild without the full preparation runner, use
`yarn build:extension:transfer-test:zip` with the required non-secret public API
configuration already exported.

## Bitcoin boundary

Only Bitcoin testnet is permitted. Mainnet and ambiguous Bitcoin registry
entries fail before fee lookup, account secret access, signing, or broadcast.
Automated tests never broadcast; a funded testnet wallet and an intentional
manual confirmation are required for a live test.

## Iroha boundary

The test profile bundles the preserved `@iroha/iroha-js` 0.0.3 candidate from
`artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/iroha-iroha-js-0.0.3.tgz`
(SHA-256
`15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8`).
It can be loaded and exercised by offline codec tests.

It is not compatible with the current live Taira transaction protocol. The
candidate creates the older `chainId` transaction form. The v4/schema
conclusion is inferred from the observed Taira build and OpenAPI: the status
response does not expose a wire-version field, while the OpenAPI requires
`networkId`, transaction-domain, fee-payment, admission, and attachment fields.
The live Taira build observed on 2026-08-24 was commit
`7efcc118eb50e3369d004d092f9b9d0b4d31ac52`; the observed OpenAPI SHA-256 was
`a151a87a41db67717397ada7b90128899b90535077a5654072db3150a4d33c73`.

For that reason, the Iroha policy and form are visible for compatibility
testing, but fee estimation and submission return
`iroha_transfer_protocol_mismatch`. The guard runs before account lookup,
mnemonic export, signing, fetch, callback, or balance refresh. No zero-fee
placeholder and no Torii POST are used. Safe manual coverage is limited to
install, account/UI rendering, form validation, the dedicated incompatibility
message, and offline codec tests.

The normal Store candidate remains transfer-disabled and is audited
separately. Never upload the transfer-test ZIP to the Chrome Web Store.
