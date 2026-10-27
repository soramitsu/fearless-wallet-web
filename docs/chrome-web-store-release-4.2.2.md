# Chrome Web Store release 4.2.2

This update targets the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc` and supersedes 4.2.1.

## Changes

- Chrome opens the wallet in a side panel, with a Settings option to use the
  popup and a popup fallback when the panel cannot open. Firefox retains its
  existing popup. Chrome adds the `sidePanel` permission.
- Compact wallet and portfolio layouts keep controls and scrolling content
  visible. Long wallet names truncate without hiding header controls.
- The portfolio displays bundled Polkaswap token logos and clearer sun artwork.
- Fresh-account signing requests remain accessible when a recovery-only wallet
  is selected. Substrate, EVM, and Solana queues retain password and signer checks.
- Recovery-only accounts may connect only to the real `https://polkaswap.io`
  origin. They still cannot sign its migration request. The migration links
  explicitly describe this limitation and open information, while the existing
  wallet creation, backup, and supported recovery steps remain available.
- Restore Refresh after returning to a cached wallet screen and keep the
  recovery guide reachable for historical wallet profiles.

## Store release note

Chrome side-panel support, a more compact portfolio, clearer recovery guidance,
and fixes for signing-request navigation, refresh controls, and long wallet names.
Old-wallet signing restrictions remain in place.

## Validation and publication

Qualify the final committed 4.2.2 source using the pinned Node 24.19.0 / Yarn
4.17.0 toolchain, full local release gates, reproducible credentialed Chrome
builds, package audits, browser smoke tests, and historical upgrade scenarios.
Do not treat earlier PR test results as evidence for the final release artifact.
This project does not use hosted CI as a release prerequisite.

Record the exact source commit, commands, results, package hashes, signed CRX
verification, and submission evidence in `output/chrome-release-4.2.2/`.
Use the existing Keychain upload signer as described in
`docs/verified-crx-uploads.md`; preserve the Store identity and public upload key.
Submit the verified package for review with automatic publication after approval.
Report submission separately from Google's approval and public availability.

The owner authorized merge, version 4.2.2, and Chrome Web Store submission on
27 October 2026 JST, and explicitly allowed one temporary release worktree.
Preserve unrelated changes in the shared canonical checkout and archive the
release worktree after retaining its evidence.
