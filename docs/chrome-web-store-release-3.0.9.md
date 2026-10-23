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

The Firefox production build at source `7cb4c076` was independently compared
with the previously approved warning artifacts. All 41 warning expressions and
locations are unchanged (40 `DANGEROUS_EVAL`, one `UNSAFE_VAR_ASSIGNMENT`), with
zero errors or notices. Only the `chunks/accounts.js` artifact hash changed;
the reviewed baseline records that hash. The complete comparison is retained
outside the checkout with the release evidence.

Bitcoin evidence uses the actual post-confirmation verification time in UTC
whole seconds. Miner header timestamps can legitimately lead that time by up
to two hours, matching Bitcoin Core's `MAX_FUTURE_BLOCK_TIME` and
`TIMESTAMP_WINDOW` in [chain.h](https://github.com/bitcoin/bitcoin/blob/master/src/chain.h).
The audit applies that bound separately to the current clock and recorded
verification time. Operator clock skew, evidence freshness, recording delay,
confirmation, transaction matching and source ancestry checks remain in force.
