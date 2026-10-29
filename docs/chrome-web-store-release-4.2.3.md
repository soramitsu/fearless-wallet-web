# Chrome Web Store release 4.2.3

This update supersedes 4.2.2 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`.

## Changes

- Identify a real toolbar popup through the browser's extension view API, so
  its full-screen button and current-site connection indicator remain visible
  even when Chrome has not finished sizing the popup at startup. Side panels,
  full tabs, approval windows, and the web app retain their existing layouts.
- Replace the retired built-in OP Mainnet Blast provider with the existing
  PublicNode provider. Migrate saved retired defaults while preserving custom
  provider choices, wallet records, and normal chain-ID validation.
- With "Auto select nodes" on, EVM networks follow the node order of the current
  network list instead of the node saved when the wallet first started. A node
  that refuses, errors, or gives no answer within 15 seconds moves the network to
  its next node, and the balance read is retried there once. A node the user
  chose is kept, and a chosen custom EVM node is now used.
- The browser-owned network lists drop the remaining discontinued Blast API
  nodes and move Dwellir nodes from the retired `api-<chain>.dwellir.com` hosts
  to the `n.dwellir.com` hosts that serve the same genesis. The list is read from
  `master` at runtime, so it also reaches installed 4.2.2 profiles.
- Make the real Chrome side-panel and popup switching test a local release
  gate. It checks both popup header controls, expansion to a full tab, reopening,
  switching between surfaces, and the side-panel portfolio.
- Update Vue I18n to the patched 11.4 release and guard the translation HTML
  escaping regressions identified during the release dependency audit. Patch
  the vendored deepmerge dependency to reject prototype-changing keys in both
  merge inputs; upstream has no patched release. Dependency audit severity
  and advisory exclusions remain unchanged.

## Store release note

Restores the popup's full-screen control and connection indicator. Repairs OP
Mainnet balance updates by replacing its retired default RPC provider, including
for existing wallet installations, and moves a network to its next node when
one stops answering.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0, the complete local
release checks, reproducible production builds, package audits, and historical
upgrade tests. Also test an exact-package 4.2.2 to 4.2.3 upgrade and both toolbar
surfaces in Chrome. Keep source commits, commands, results, artifact hashes,
signed upload verification, and submission evidence under
`output/chrome-release-4.2.3/`.

Use the existing Keychain upload signer and Store identity. Submit the verified
package for review with automatic publication after approval. Report submission,
Google's approval, and public availability separately. Hosted CI is not a
release prerequisite.

The owner authorized the fixes, local tests, Chrome retest, version 4.2.3, and
Store publication on 29 October 2026 JST, and requested using master in the
canonical checkout. Unrelated shared-checkout changes were retained in a
verified recovery snapshot before switching branches.
