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
- Make the real Chrome side-panel and popup switching test a local release
  gate. It checks both popup header controls, expansion to a full tab, reopening,
  switching between surfaces, and the side-panel portfolio.

## Store release note

Restores the popup's full-screen control and connection indicator. Repairs OP
Mainnet balance updates by replacing its retired default RPC provider, including
for existing wallet installations.

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
