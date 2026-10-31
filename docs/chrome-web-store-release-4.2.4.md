# Chrome Web Store release 4.2.4

This update supersedes 4.2.2 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`. It contains every 4.2.3 change
(`docs/chrome-web-store-release-4.2.3.md`): 4.2.3 was uploaded as a Store draft
but never submitted, so installed 4.2.2 profiles update to 4.2.4 directly. It
also contains PRs #1100 (cross-chain hardening) and #1102 (key generation input
guards), and the fixes from a full review of the extension on 1 November 2026.

## Changes

### Sends, keys and backups

- Substrate: a send that would leave the account above 0 but below the network's
  existential deposit asks first, because the chain removes such an account and
  burns what is left. A send is reported done only once a block includes it
  without a dispatch error; a lost connection or timeout after the node took it
  is reported as "may already have been sent", with the hash. Signing refuses a
  node whose genesis is not the network's (a wrong custom or registry node).
- EVM: a send is made with `eth_sendRawTransaction` alone. A transfer the node may
  have taken is never reported as failed: the Send screen shows its hash to check
  before sending again, and a site's `eth_sendTransaction` gets the hash. Only a
  refusal by the node fails. Native-coin gas is estimated for the real sender and
  value; an ERC-20 transfer the node cannot estimate is refused instead of being
  sent with too little gas. Reverted transactions show as failed in history, and a
  site's JSON-RPC `input` calldata is signed as the transaction data.
- TON: a jetton send gives the sender's jetton wallet 0.05 TON, bounceable, instead
  of 0.02 TON, which TEP-74 reference jetton wallets refuse; the Send screen checks
  the TON balance against 0.07 TON for a jetton send.
- Max settles on networks whose fee changes every block (Base, OP, Polygon), so
  Continue enables.
- Export screens never show a phrase or keystore for a wallet other than the one
  they were opened for, and ask for the password again after they are left. A
  mnemonic export of a wallet made with a derivation path or `///password` says
  that the phrase alone restores a different account; such wallets are not offered
  a raw seed export.
- Deleting a wallet keeps an EVM account that another wallet still links.
- Key generation refuses a secret URI without a phrase or seed and unsupported
  phrase lengths (#1102).
- Restore from a JSON backup file works again (broken since 4.2.0). Back is
  disabled while a Google Drive wallet is being saved. "Add Ethereum account"
  adds the account to the selected wallet (and never replaces one), and "Don't
  need" clears Ethereum input typed earlier.
- A stored wallet selection that cannot be used no longer locks the wallet.

### dApp connections and signing

- A page is checked against its own origin's grant, never the tab's URL, so a page
  prerendered in a tab of an authorized site cannot use that site's grant or show
  its URL in signing prompts. Requests from a prerendered page wait until it is
  shown; requests from subframes are refused.
- The content script connects on a page's first request, and the injected Solana
  and Iroha providers ask for accounts only once the page uses them. A request open
  when the connection is lost (back/forward cache, wallet restart) is answered with
  an error instead of hanging, and the next request reconnects.
- Solana `signMessage` refuses a payload that is a transaction message.
- Reject no longer cancels a transaction an approval is already submitting. When a
  page's connection closes (tab closed or reloaded, back/forward cache), its pending
  signing requests and connect prompts are dropped as Reject would drop them,
  except one whose transaction an approval may already be sending, so a retry from
  the page cannot leave a second approvable request behind.
- Sites on the phishing list get no connection prompt. Wallets whose only account
  is an imported EVM key work with EVM dApps. Metadata supplied with an upper-case
  genesis hash no longer breaks Substrate signing.
- Cross-chain hardening (#1100): site-requested XCM and bridge calls are decoded
  with the wallet's own runtime and refused toward destinations that cannot
  deliver; reviewed call bytes are compared with an independent layout; each
  reviewed runtime's fee asset is pinned; production builds accept only TLS
  registry nodes; the Dwellir API key goes only to Dwellir hosts; the unused
  legacy bridge builders are removed. Cross-chain quotes use the nodes 4.2.3
  moved to.

### Balances and networks

- Wallets created by versions 1.x to 2.7.x connect their networks again (since
  4.2.0 they connected none, so balances stayed empty and sends could not run).
- The Favorites filter connects the favourite networks (it connected the others).
- A short time offline no longer switches Substrate networks off for the rest of
  the session; a network whose nodes all fail reconnects with a backoff.
- TON balances load when the GitHub network registry cannot be reached.
- Every active EVM network refreshes while the wallet is open (ZetaChain, CAGA,
  Kaia, Viction, 5ire and inEVM were missed), and refreshing one asset no longer
  marks the other EVM networks as failed.
- A Substrate network one of whose asset keys does not encode on that chain (for
  example Pendulum's `xcm` assets) no longer blocks every balance of the network:
  that asset fails alone. New or empty wallets therefore see their balances in a
  fraction of a second instead of after the 20-second first-load wait.
- SOL shows as unavailable, not 0, when its first read fails. Other wallets'
  Substrate totals are read only from ready connections; a network that is not
  ready is marked as not refreshed.
- Solana history shows the wallet's own sends as outgoing.
- Explorer links follow the network registry; old wallets can open a WalletConnect
  session to disconnect it; Wallet details shows the opened wallet's name; turning
  off automatic node selection pins the node the screen shows.

### Performance

- One connection per network: network-list refreshes opened another connection per
  active network and never closed the old ones. The discovery sweep connects each
  network once, not once per wallet.
- Tab switches, focus changes and ordinary page loads no longer wake the
  background worker and rerun its start-up. Without a paired mobile wallet, the
  WalletConnect provider no longer starts with its 5-second heartbeat, so the worker
  can sleep.
- The popup wakes the worker before its own scripts run (first answer about 35 ms
  sooner on a cold start), and unlocking takes one bcrypt check instead of two
  (about 515 ms down to about 257 ms) when the stored verifier is current.
- Network status changes are written at most once a second, and the network map
  has its own storage queue, so the Unlock screen no longer waits behind network-map
  writes; popup subscription traffic on open fell from about 292 KB to 13 KB.
- The 1-minute registry retry alarm exists only while the registry is unavailable,
  and starting the worker no longer reschedules the hourly asset sweep.
- The 2 MB scam address list is downloaded once per start instead of twice.
- The balance cache is written once per burst of updates instead of a full read and
  write per asset; TON makes one TI request per refresh; wallet rows share one
  totals request.
- Only the wallet home tabs, swap, DeFi and settings screens stay cached; hidden
  copies of send forms and asset pages no longer re-render and refetch.

## Store release note

Safer sends on Substrate, EVM and TON networks, safer dApp connections and signing,
JSON backup restore works again, wallets from older versions connect their
networks again, and less background CPU and network use. Includes the 4.2.3 OP
Mainnet balance and node failover fixes.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0, the complete local
release checks (`prepare:chrome-release`), reproducible production builds, package
audits, historical upgrade tests, an exact-package 4.2.2 to 4.2.4 upgrade and both
toolbar surfaces in Chrome. Keep source commits, commands, results, artifact
hashes, signed upload verification and submission evidence under
`output/chrome-release-4.2.4/`.

Use the existing Keychain upload signer and Store identity. Submit the verified
package for review with automatic publication after approval. Report submission,
Google's approval and public availability separately. Hosted CI is not a release
prerequisite.

The owner asked on 1 November 2026 JST for the extension to be reviewed for bugs,
fixed, made faster and released to the Chrome Web Store as an update.
