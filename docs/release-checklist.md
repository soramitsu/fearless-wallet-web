# Release Checklist

Use this checklist for every browser-extension release PR from `develop` to
`master`.

## Before The Release PR

- Confirm all release work has landed on `develop`.
- Confirm extension version, changelog, and release notes are final.
- Confirm no private extension keys, OAuth client IDs, analytics tokens, store
  credentials, or local environment files are committed.
- Run `bash ./scripts/test-branch-flow-audit.sh && bash ./scripts/audit-branch-flow.sh`
  and confirm the release branch flow rules still pass.
- Run `bash ./scripts/test-public-artifacts-audit.sh && ./scripts/audit-public-artifacts.sh`
  and confirm public artifact boundaries still pass.
- Run `bash ./scripts/test-todo-debt-audit.sh && bash ./scripts/audit-todo-debt.sh`
  and confirm no new TODO/FIXME/STOPSHIP debt was introduced.
- Run `yarn npm audit --environment production` and confirm there are no
  production dependency audit findings.
- Confirm public extension builds work without private manifest credentials.
- Run `IROHA_JS_SDK_RELEASE_REPO=<repo> IROHA_JS_SDK_RELEASE_TAG=<tag>
  IROHA_JS_SDK_RELEASE_ASSET=<asset> IROHA_JS_SDK_RELEASE_SHA256=<sha256>
  ./scripts/audit-public-artifacts.sh` before enabling an Iroha browser SDK
  package in release builds. Use `IROHA_JS_SDK_VERSION=<version>` for a
  published npm package, or `IROHA_JS_SDK_TARBALL=<path>` for local
  release-candidate tarballs.
- Keep `VUE_APP_ENABLE_IROHA_TRANSFERS=false` unless the same release audit is
  run with a pinned Iroha JS SDK artifact and the SDK checker passes.
- Run `yarn test:smoke:bitcoin`,
  `yarn test:bitcoin-broadcast-evidence-template`,
  `yarn generate:bitcoin-broadcast-evidence-template -- --output
  build/reports/bitcoin-broadcast-evidence-template.json`,
  `yarn test:bitcoin-broadcast-evidence-audit`, and
  `yarn audit:bitcoin-broadcast-evidence`. Before treating Bitcoin send as
  release-ready, use the generated template to prepare the manifest, run a
  funded live testnet broadcast with
  `FEARLESS_BITCOIN_TESTNET_LIVE=1 yarn test:smoke:bitcoin`, record the txid,
  outpoint, amount, source/recipient testnet addresses, indexer URL, operator,
  timestamp, and commit in `scripts/bitcoin-testnet-broadcast-evidence.json`,
  set `status: ready` and `releaseEnabled: true`, then rerun
  `yarn audit:bitcoin-broadcast-evidence --require-ready`.
- Run or confirm green CI for branch-flow audit, public artifact audit,
  TODO-debt audit, production dependency audit, typecheck, lint, unit tests,
  extension build, Solana extension e2e smoke, and Bitcoin broadcast smoke.
- Confirm Universal Wallet migrations, legacy export-only access, and supported
  network registry changes are documented in the PR.
- Confirm rollback owner, monitoring owner, and release communication channel.

## Release PR To `master`

- Open the PR from `develop` or `release/<version>` to `master`.
- Include test evidence, migration notes, release notes, and rollback notes.
- Confirm the `Branch Flow` workflow is green for the release PR.
- Require review and green CI before merge.
- Merge with a merge commit so the release boundary is visible.
- Create the release tag only after the merge commit is on `master`.

## After Release

- Verify the packed extension artifact matches the tagged commit.
- Monitor install/update failures, wallet creation/import, dApp provider
  requests, signing errors, and indexer error rates.
- Keep the hotfix path ready from `master` until rollout completes.
