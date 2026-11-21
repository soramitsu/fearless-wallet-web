# Chrome Web Store release 4.2.8

This update follows 4.2.7 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`. 4.2.7 (built from `ba1fb428`) was submitted on
10 November 2026 and is live; it carries everything in
`docs/chrome-web-store-release-4.2.7.md`. 4.2.8 is the branch that takes every open web
pull request into master (#1117): the Yatagarasu brand, imported Ethereum wallet
access, EVM authorization and swap quote fixes, and wallet-password protection for
Universal Wallet accounts.

## Changes

### Yatagarasu brand

- The Yatagarasu crest replaces the winged sun in the extension icons, favicon,
  notifications, logo, loader, QR centre and header badge (#1116).
- The onboarding start shows the animated crow. Clicking it plays its call when the
  sound toggle is on; reduced motion, reduced effects and calm surfaces show the still
  poster.
- Onboarding, Welcome and Unlock show the stacked lockup over the gold-ruled tagline.
- The portfolio sky draws the crest as the sun inside the allocation fan.
- Pages use the brand's ink palette, as the iOS and Android apps do. Links and the
  focus ring stay cyan, and every text pair keeps at least 4.5:1 over the backdrop.

### Imported Ethereum wallets and balance scans

- An Ethereum private key imported on its own can be selected as its own wallet again
  (#1115).
- Balance scan warnings stay accurate: a network's scan failure is kept when the
  balance cache cannot be updated, and a dropped asset's failure clears once a whole
  network refresh succeeds (#1115).

### Site requests and swaps

- A site gets its EVM account from `eth_accounts` only while it is still allowed,
  `net_version` answers in decimal for any chain ID, and the swap form recovers its
  cached quotes (#1099).

### Universal Wallet password

- New and imported wallets protect their Bitcoin, Solana, TON and Taira accounts with
  the wallet password, used as the BIP39 passphrase. Funded addresses from the words
  alone are kept, a password wallet is told about old addresses and can switch, old
  addresses stay watched after a switch, and the backup screen says the words alone no
  longer restore those accounts (#1104).

## Not in this release

- The portfolio sky's cursor parallax (#1101) was built for the winged sun's wings and
  is not carried over to the crest sky.

## Store release note

New look: the Yatagarasu crow replaces the winged sun. Imported Ethereum wallets work
again, and new wallets protect their Bitcoin, Solana, TON and Taira accounts with your
wallet password.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0 and the complete local
release checks (`prepare:chrome-release`). The checks cover:

- reproducible production builds and package audits;
- historical upgrade tests;
- the exact-package upgrade from 4.2.7 (live on the Store);
- both toolbar surfaces in Chrome;
- `scripts/security-session-extension-smoke.mjs` on the release package.

The release checks need Bitcoin testnet broadcast evidence no older than 7 days. Keep
source commits, commands, results, artifact hashes, signed upload verification and
submission evidence under `output/chrome-release-4.2.8/`.

Sign with the Keychain upload signer, which asks the owner. Submit for review with
automatic publication. Report submission, Google's approval and public availability
separately. Hosted CI is not a release prerequisite.

The owner asked on 10 November 2026 to merge all open work into master and to submit it
to the Chrome Web Store for public release.
