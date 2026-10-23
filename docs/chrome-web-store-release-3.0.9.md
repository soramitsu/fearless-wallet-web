# Chrome Web Store release 3.0.9

This update enables Bitcoin transfers and SORA Nexus Taira testnet XOR transfers
in the Chrome extension. It includes the recovery behavior, upgrade notice,
privacy notice and metadata corrections from 3.0.8.

## User-visible changes

- Send BTC from Bitcoin accounts, including Bitcoin Testnet accounts. Universal
  Wallet users can select the supported test networks and load their balances
  and history.
- Send testnet XOR on Taira using local signing and direct Torii submission.
  History correctly identifies outgoing transfers and their recipients.
- Calculate Bitcoin fees from actual spendable inputs, support maximum sends
  from fragmented balances, and require a new approval if either network fee
  increases. Quotes are invalidated when the transfer form changes.
- Preserve the transaction hash when a Bitcoin or Taira submission has an
  uncertain outcome, and warn users to check history before sending again.
- Show pending Bitcoin sends first, with a current timestamp while awaiting
  confirmation. Retry transient history-provider errors and display the
  Bitcoin, XOR and Solana icons and address identicons.

Both send flags are derived from the checked-in evidence manifests. The release
preparation gate verifies the evidence against the live networks and rejects
stale evidence or changes to the covered transaction paths. Environment values
cannot enable a send independently of that evidence.

## Package and listing

Version: `3.0.9`. Keep the reviewed short description unchanged:

> Manage crypto accounts, view balances, and connect to compatible decentralized apps.

Use `docs/chrome-web-store-description.txt` for the full listing. It describes
BTC sending and testnet XOR sending without repeated network keyword lists.
Keep the existing item ID `nhlnehondigmgckngjomcpcefcdplmgc`, production public
configuration, permissions, privacy disclosures and upgrade behavior.

## Verification and submission

Run the complete `prepare:chrome-release` gate from a clean checkout using the
ignored production configuration. It includes the dependency audits, typecheck,
lint, unit and browser tests, live transfer-evidence checks, two reproducible
production package builds and an artifact audit. Record the source commit,
package SHA-256 and submission result outside the checkout.

Submit the verified ZIP to the existing Chrome Web Store item, with automatic
publication after approval. If 3.0.8 is still pending review, replace that draft
only after the 3.0.9 candidate is verified. Google review is external; pending
review is not a published release. Follow `docs/release-checklist.md` for the
reviewed source merge and release tagging.
