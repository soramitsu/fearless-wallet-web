# TON Connect in the browser extension

The extension is a TON Connect v2 wallet over the **JS bridge**: every HTTPS page (and `http://localhost` /
`127.0.0.1`) gets `window.Fearless.tonconnect`, the same bridge key the iOS in-app browser injects. Its `deviceInfo`
names the app `Fearless`, as both mobile apps do.

What a dApp can do:

| Request | Behaviour |
| --- | --- |
| `connect` with `ton_addr` | The popup shows the site (its origin, not the manifest's claim), the manifest's name and icon, and the TON wallets to choose from. A page connected before reconnects without a prompt. |
| `connect` with `ton_proof` | Always prompts. The proof's domain is the page's own host as the browser reports it, never a domain from the manifest or the request, so a site cannot get a proof for another domain. Names without a dot (`localhost`) get no proof, as the spec requires. |
| `restoreConnection` | The saved session's address, or `connect_error` 100. |
| `sendTransaction` | Up to 4 raw messages (`messages[]`; structured `items` are refused with 400). Friendly addresses only, their bounce flag kept; `network` must be `-239`, `from` must be the connected wallet, `valid_until` becomes the wallet message's expiry. The popup decodes TON transfers, comments, jetton and NFT transfers; anything else, a jetton amount (whose decimals the request does not carry) or a state init asks for the raw data first. Send mode 3, through the verified TON provider. |
| `signData` | `text`, `binary` and `cell`, bound to the page's host, with the spec's byte layouts. Text is shown; binary and cells get the unknown-content warning. |
| `disconnect` | Ends the session; no event back to the page. |
| wallet events | Disconnecting a site in Settings → TON Connect, removing its TON wallet, or resetting the wallet sends the page a `disconnect` event. |

Checks every approval passes: the phishing list, the `ton_dapp_signing_enabled` remote veto (it also pauses a connect
that asks for a proof), the recovery-only wallet policy, the session still being bound to the same wallet, request ids
rising within a session, and the wallet not being locked or reset meanwhile. Sessions (`fwTonConnect:sessions`) hold
the origin, the wallet address and the manifest, no key: the JS bridge is not encrypted.

Only wallets in the TON keyring (those Send signs for) can be connected.

## Being listed in dApps

TON Connect SDK 4 (`@tonconnect/sdk` 4.0, TON Connect UI 3) shows an injected wallet only when the public wallets
list (`config.ton.org/wallets-v2.json`, repository `ton-blockchain/wallets-list`) has an entry with its bridge key;
`getCurrentlyInjectedWallets()` returns nothing outside the SDK's QA mode. Until Fearless is listed, dApps on SDK 4
connect to the extension only if they name it (`connect({ jsBridgeKey: 'Fearless' })` or
`walletsListConfiguration.includeWallets`). Older SDKs list it on their own.

The entry submitted as [ton-connect/wallets-list#370](https://github.com/ton-connect/wallets-list/pull/370), in
draft until this release is in the Chrome Web Store and the mobile catalogs use the new bridge. The list requires
`app_name` to equal `deviceInfo.appName` and the bridge key, so all three are `Fearless`; the smoke test serves the same
entry:

```json
{
  "app_name": "Fearless",
  "name": "Fearless Wallet",
  "image": "https://raw.githubusercontent.com/ton-connect/wallets-list/main/assets/fearless.png",
  "about_url": "https://fearlesswallet.io",
  "universal_url": "https://fearlesswallet.io/ton-connect/",
  "bridge": [
    { "type": "sse", "url": "https://connect.ton.org/bridge" },
    { "type": "js", "key": "Fearless" }
  ],
  "platforms": ["ios", "chrome"],
  "features": [{ "name": "SendTransaction", "maxMessages": 4, "extraCurrencySupported": false }]
}
```

- Features are what every listed platform supports: the iOS app has no SignData yet (the extension does, and says so in
  its own `deviceInfo`).
- Android is left out: it opens `https://fearlesswallet.io/ton-connect/` links without starting a connection, and its
  scanner accepts only `tc:` codes, while dApps show a listed wallet's QR as its universal link.
- The mobile apps' bridge moved from the dead Soramitsu hosts (`fearless-ton-bridge.odachi.soramitsu.co.jp`, NXDOMAIN,
  and `.tachi.`, SERVFAIL, on 2026-11-21) to `https://connect.ton.org/bridge`: fearless-iOS#1330, fearless-Android#1284.

## Checking it

- Unit: `tests/unit/ton-connect-*.spec.ts` (protocol vectors against the reference verifiers, service flows with real
  signatures, manifest, review).
- Real browser: build the test extension, then `node scripts/ton-connect-extension-smoke.mjs` (or
  `yarn test:e2e:ton-connect`). A page on `https://app.tonconnect.test` uses the official SDK bundle to connect with a
  proof, restore after a reload, sign text and send a transaction, each approved in the popup; the proof and
  signatures are verified independently, the TON provider is answered inside the browser so nothing is broadcast, and
  the wallet-side disconnect must reach the page. Screenshots and `report.json` go to `build/reports/ton-connect-smoke/`.
