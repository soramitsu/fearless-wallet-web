# Chrome Web Store release 4.2.6

This update follows 4.2.5 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`. 4.2.5 was submitted for review on 3 November
2026 and carries everything in `docs/chrome-web-store-release-4.2.5.md`. 4.2.6
adds the two changes finished on 3 November 2026 after that submission:
WalletConnect pairing works again, and the background worker rests when nothing
needs it.

## Changes

### WalletConnect

- Fearless, as a WalletConnect wallet, approves session proposals again. Every 4.2
  build refused them as expired: the wallet read a proposal's `expiry`, which the
  WalletConnect SDK it has used since 4.2.0 no longer writes, and took the missing
  value as expired. It now reads `expiryTimestamp`, falls back to `expiry`, and still
  refuses a proposal with neither or with a deadline that is not a finite number.
- Rejecting a live proposal now tells the dApp (`USER_REJECTED`); before, the dApp
  waited until its own timeout.

### Performance

- The background worker no longer runs all the time once a wallet exists. After a
  minute with no wallet page (popup, side panel or tab), no site request and no open
  work (a request waiting for approval, a WalletConnect or Iroha Connect session, a
  discovery sweep), it closes its node connections and jobs. In Chrome for Testing an
  idle 4.2.5 wallet kept making about 89 requests, 432 WebSocket frames and 0.53 s of
  CPU every 3 minutes; 4.2.6 makes no wallet request after that minute.
- A wallet page or a site's request opens the connections again. A site's request
  waits for them, at most 15 s; a popup opened meanwhile shows the stored balances
  at once, before the networks read them again. If reconnecting fails, the next page
  message or site request tries again.
- A locked wallet lets Chrome end the worker, about 90 s after the last activity. An
  unlocked wallet keeps it until its 30-minute session ends, as in 4.2.5: a local call
  every 20 s, with no network request, keeps Chrome from ending the worker, which
  holds the unlocked keys. Firefox and the web wallet are unchanged.
- A site's event subscriptions (`connect`, `chainChanged` and `accountsChanged`, and
  the Solana and Iroha events) are sent again after the worker stopped, so the site's
  listeners keep working.

## Not in this release

- Trimming the background bundle, which needs the pinned `vite.config.shared.mjs`
  changed.
- Found while making these changes, not changed: the popup's unsupported-method
  warning for WalletConnect reads only `requiredNamespaces`, which current dApps
  leave empty; a proposal refused as unsupported or expired is still not reported to
  the dApp; `initNetworkApis()` rebuilds every EVM provider on each call; and the EVM
  events subscription listens for `data` on the ethers 6 provider, which rejects.

## Store release note

WalletConnect connections work again, and the wallet uses much less CPU and network
while idle.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0, the complete local
release checks (`prepare:chrome-release`), reproducible production builds, package
audits, historical upgrade tests, exact-package upgrades from 4.2.4 (live on the
Store) and from the 4.2.5 upload, both toolbar surfaces in Chrome, and on the release
package the WalletConnect pairing check (`scripts/walletconnect-pairing-smoke.mjs`)
and the worker sleep soak (`scripts/extension-sleep-soak.mjs`). The release checks
need Bitcoin testnet broadcast evidence no older than 7 days. Keep source commits,
commands, results, artifact hashes, signed upload verification and submission
evidence under `output/chrome-release-4.2.6/`.

Use the existing Keychain upload signer and Store identity. Submit the verified
package for review with automatic publication after approval once 4.2.5 is live, so
that 4.2.5's review is not restarted. Report submission, Google's approval and public
availability separately. Hosted CI is not a release prerequisite.

The owner asked on 4 November 2026 JST for 4.2.6 to be prepared with both changes.
