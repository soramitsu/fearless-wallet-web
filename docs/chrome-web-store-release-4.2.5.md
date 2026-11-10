# Chrome Web Store release 4.2.5

This update follows 4.2.4 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`. 4.2.4 was submitted for review on 1 November
2026 and carries everything in `docs/chrome-web-store-release-4.2.4.md`. 4.2.5
adds the fixes that the 1 November review of the extension left for a later
release, made on 2 and 3 November 2026.

## Changes

### Sends and signing

- TON: a native TON send to a bounceable address (`EQ…`, or a raw address) bounces
  when the account there has code, so a contract that refuses TON (a jetton master
  or wallet, a DEX) sends it back instead of keeping it. A non-bounceable address
  (`UQ…`) and an address with nothing deployed do not bounce, so funding a new
  wallet works as before. When the recipient cannot be read, the address decides.
- Substrate tokens: Continue asks before a token send leaves more than 0 and less
  than the token's own minimum (ORML existential deposit, Asset Hub min balance),
  as it does for the network's existential deposit; the chain removes a token
  balance left below it. Asset Hub minimums, which the registry does not list, are
  read from the chain.
- Locking the wallet (auto-lock or Lock) and Reset wallet no longer tell a site
  "Wallet locked" while the transaction an approval was sending lands. A
  transaction being sent is left to its approval, which reports its hash or its own
  error; every other request is still cancelled, before any key is used.
- SORA operations (swaps, pool deposits and withdrawals, farming, staking) refuse to
  sign through a node whose genesis is not SORA's, as other Substrate sends do since
  4.2.4.
- SORA cosigner envelopes of a wallet made with a derivation path or `///password`
  use the wallet's own key, so the wallet opens envelopes sent to it and the other
  cosigners open its own.
- Pendulum and Amplitude XCM tokens (USDT, USDC, DOT, GLMR and others) are read and
  sent by their XCM index, so their balances load and their sends can be built.

### Wallet screens

- The network filter chosen in a wallet's network list stays until it is changed
  there; every popup start and wallet update used to bring a new wallet back to
  Popular networks, which leave out Polkadot and Kusama Asset Hub.
- `wallet_switchEthereumChain` to a network outside the wallet's selection connects
  that network only. It no longer replaces the selection with that one network and
  disconnects the others; a restarted wallet connects it again when the site uses it.
- An asset's page shows the same amount and value as its row in the portfolio list:
  the total, staked and locked funds included, rounded down to 4 decimals, a
  nonzero amount never shown as 0.
- Taira's balance stays in one row, and a failed read shows as unavailable, not 0.
- A WalletConnect session record that cannot be read no longer stops start-up from
  selecting a wallet, and Reset wallet replaces it instead of failing; no earlier
  session is trusted.

### Performance

- The wallet's portfolio is built once per balance, price or network update instead
  of about five times (the review measured about 24 ms of popup main-thread work per
  update with the production registry), and the wallet screen no longer sorts and
  filters every token group for props nothing reads.

## Not in this release

- Letting the background worker sleep while a wallet exists. It closes every
  network connection and job when no wallet page or site needs them, so it ships
  separately, with real-browser checks that the worker stops and starts again
  cleanly.
- Trimming the background bundle, which needs the pinned `vite.config.shared.mjs`
  changed.

## Store release note

Safer TON sends to contracts, a warning before a token send leaves less than the
token's minimum, safer site transactions when the wallet locks, Pendulum and
Amplitude token balances, and a network filter that stays as chosen.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0, the complete local
release checks (`prepare:chrome-release`), reproducible production builds, package
audits, historical upgrade tests, an exact-package upgrade from the version live on
the Store and both toolbar surfaces in Chrome. The release checks need Bitcoin
testnet broadcast evidence no older than 7 days. Keep source commits, commands,
results, artifact hashes, signed upload verification and submission evidence under
`output/chrome-release-4.2.5/`.

Use the existing Keychain upload signer and Store identity. Submit the verified
package for review with automatic publication after approval, once 4.2.4 is live or
in its place. Report submission, Google's approval and public availability
separately. Hosted CI is not a release prerequisite.

The owner asked on 1 November 2026 JST for the extension to be reviewed for bugs,
fixed, made faster and released to the Chrome Web Store as an update, and on
2 November to keep going.
