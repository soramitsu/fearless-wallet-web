# Chrome Web Store release 3.0.10

This update turns on Solana in the Chrome extension. Balances and sends read and
broadcast through public Solana JSON-RPC nodes with automatic failover; nothing
on the Solana path depends on the `si.soramitsu.io` indexer. It includes
everything in 3.0.9 (Bitcoin sends, Taira testnet XOR sends, recovery behavior,
upgrade notice, privacy notice and metadata corrections).

## User-visible changes

- View your Solana address and SOL balance, and send SOL. Sends are quoted and
  priced before you approve them: the network fee, the priority fee and, when a
  send opens a new token account for the recipient, that one-time deposit as its
  own line. Max sends everything that leaves room for them.
- Addresses that would lose your funds are refused before anything is signed:
  programs, token accounts and addresses that cannot sign. Amounts too small to
  open a new account, and sends that would strand less than the network's
  minimum balance, are refused with an explanation.
- A send whose outcome the network has not settled is shown as unconfirmed with
  its signature, and the wallet will not start another Solana send until the
  first is resolved, so a lost reply can never be paid twice.
- Max keeps the priority fee it quoted for the amount it fills in, so a fee that
  moves in between can neither turn the exact maximum into a shortfall nor leave
  less than the network's minimum balance behind.
- SOL balances now show a fiat value and count toward totals. The price lookup
  asked for `sol`, which the price service does not know; it now asks for
  `solana`.
- History links to Solscan, so the list is never an empty dead end.
- Compatible Solana apps can connect and request signatures, as before; you
  approve each request, and a dApp's send-and-sign uses the same safe broadcast.
  When a broadcast may already have reached the network, the app is handed the
  transaction's id (its first signature, the fee payer's), not an error, so it
  follows the transaction instead of asking for a second one.
- Token (SPL) balances and token sends need a Solana node that accepts requests
  from browser extensions. The public nodes currently refuse them, so SOL works
  out of the box and tokens appear after you add such a node: open an asset on
  the Solana network, choose **Switch node**, then **Add custom nodes**. A node
  address is an `https://` JSON-RPC address (a provider key in the path or the
  query string is kept); the node you pick is tried first. Saving a custom
  Solana node previously failed with an error after storing it, and the form
  accepted only `wss://` addresses; both are fixed.

## How it reads and sends

- Nodes are tried in order: your selected or custom node, then
  `api.mainnet-beta.solana.com`, PublicNode and dRPC. Any refusal moves to the
  next node (the public Solana mainnet node answers 403 to every browser extension).
- Each node first names its cluster by genesis hash and is skipped unless it is
  the expected one, so a devnet or testnet node behind a mainnet name is never
  used. The check is repeated every few minutes.
- A broadcast tries each node once and remembers whether a post may have reached
  one. The signed transaction is recorded before it is broadcast and is only
  rebroadcast unchanged; a send settles on a confirmed status or after its
  blockhash expires.
- A blockhash counts as expired only when one node, on its own, reports that it
  has finalized past the transaction's last valid block and, from a state at
  least that recent, still has no trace of the signature. Answers from different
  nodes are never combined, a node that has seen the signature or has not caught
  up keeps the send open, and a confirmed status from any node ends it as
  landed. Until then the wallet will not sign another Solana send.
- Solana sends ship enabled. A veto-only, sticky remote switch can stop them in
  an emergency and can never enable anything; see `docs/send-kill-switch.md`.

## What is not in this release

- Token-2022 tokens can be held and received but not sent. Standard SPL tokens
  without extensions can be sent.
- Solana staking, the NFT gallery and Solana Pay stay out of scope.
- The signing-queue ownership and site-grant revalidation changes planned for
  the next major extension release are not part of this release; Solana dApp
  requests keep the behavior they have in 3.0.9.
- Wallet reset during an in-flight Solana send is not fenced (the 3.0.x keyring
  keeps no reset revision). The send finishes as the user asked, and its
  recorded transaction survives for the next send to resolve.
- Bitcoin and Taira sends are unchanged. Their evidence manifests still verify:
  no file listed as a covered transfer path changed.

## Package and listing

Version: `3.0.10`. Keep the reviewed short description unchanged:

> Manage crypto accounts, view balances, and connect to compatible decentralized apps.

Use `docs/chrome-web-store-description.txt` for the full listing, which now
describes Solana. Keep the existing item ID `nhlnehondigmgckngjomcpcefcdplmgc`,
production public configuration, permissions, privacy disclosures and upgrade
behavior. The privacy notice already says the extension contacts blockchain RPC
nodes; for Solana those are `api.mainnet-beta.solana.com`,
`solana-rpc.publicnode.com` and `solana.drpc.org`, plus any node the user adds.

## Verification and submission

Run the complete `prepare:chrome-release` gate from a clean checkout on Node
24.19.0 with the ignored production configuration, or dispatch the existing CI
workflow on the release branch with `prepare_chrome_release` enabled, exactly as
for 3.0.9 (`docs/chrome-web-store-release-3.0.9.md`). The Solana-specific gates
are:

- `yarn test:unit` (all Solana specs, including the cluster-binding, send-safety
  and send-form specs);
- `yarn test:e2e:local-chains`, which drives the real send code against a
  disposable `solana-test-validator` and contacts no public network;
- `yarn test:e2e:solana`, the real-Chrome smoke for the dApp provider.

Per the release plan, a small funded mainnet canary (SOL to a fresh address and
back) is a team task before staged rollout; no mainnet transaction was made while
preparing this release.

Submit the verified ZIP to the existing Chrome Web Store item with automatic
publication after approval. If 3.0.9 is still pending review, replace that draft
only after the 3.0.10 candidate is verified. Google review is external; pending
review is not a published release.
