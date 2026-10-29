# Chrome Web Store release 4.2.3

This update targets the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc` and supersedes 4.2.2.

## Changes

- Balances load again when a network's first node stops answering. In 4.2.2
  every OP Mainnet balance, and the ETH row that includes it, read "Balance
  update failed": Blast API, OP Mainnet's first node, now refuses every call
  with HTTP 403 "Blast API is no longer available", and each profile had saved
  that node as current when it first loaded the network list.
- With "Auto select nodes" on (the default), EVM networks follow the node order
  of the current network list instead of the node saved at first start. A node
  that refuses, errors or gives no answer within 15 seconds moves the network
  to its next node, and the balance read is retried there once. A node the user
  chose is kept, and a custom EVM node is now used when chosen.
- The browser-owned network lists drop the discontinued Blast API nodes and
  move Dwellir nodes from the retired `api-<chain>.dwellir.com` hosts to the
  `n.dwellir.com` hosts that serve the same genesis. This list is read from
  `master` at runtime, so it reaches 4.2.2 profiles when merged; 4.2.2 still
  keeps its saved OP Mainnet node until this update installs.

## Store release note

Fixes balances that failed to update on OP Mainnet and other networks whose
first node stopped answering.

## Validation and publication

Qualify the final committed 4.2.3 source with the full local release gates:
unit and type checks, a credentialed production Chrome build, package audits,
browser smoke tests, and an upgrade from the 4.2.2 Store package in the same
profile with OP Mainnet balances loading afterwards. This project does not use
hosted CI as a release prerequisite.

Record the exact source commit, commands, results, package hashes, signed CRX
verification, and submission evidence in `output/chrome-release-4.2.3/`. Use
the existing Keychain upload signer as described in
`docs/verified-crx-uploads.md`, and report submission separately from Google's
approval and public availability. Merge and Store submission need the owner's
approval.
