# Release Checklist

Use this checklist for every browser-extension release PR from `develop` to
`master`.

For Chrome `3.0.6`, also use the store copy, permission/privacy handoff, and
credentialed artifact gates in `docs/chrome-web-store-release-3.0.6.md`.

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
- Run `yarn audit:dependencies`, `yarn audit:dependencies:production`, and
  `yarn test:crypto-dependency-shims`; confirm there are no dependency audit
  findings outside the two documented `image-size` development-tool
  exceptions in `docs/dependency-audit-exceptions.md`, and confirm the unused
  generic/BIP-322 crypto paths still fail closed.
- Confirm public extension builds work without private manifest credentials.
- Run `yarn test:extension-package`, `yarn test:extension-build-environment`,
  `yarn test:import-chrome-release-config`,
  `yarn test:prepare-chrome-release`, `yarn test:release-source-audit`,
  `yarn test:vendored-iroha-sdk-audit`, `yarn audit:vendored-iroha-sdk`,
  `yarn test:chrome-release-audit`,
  `yarn build:extension:zip`, and
  `yarn test:smoke:chrome:production`. From a clean reviewed release checkout,
  rerun both `yarn test:smoke:chrome:production` and
  `yarn audit:chrome-release:release` using the ignored
  `.env.chrome-release.local` file through `env-cmd` (or an equivalent
  credential manager) so the production extension public key, OAuth client ID,
  and public service configuration are available without being committed.
- From a fresh, clean reviewed checkout, run
  `yarn env-cmd -f .env.chrome-release.local -- yarn prepare:chrome-release` to
  produce the untagged candidate provenance. After the reviewed merge commit is
  tagged, rerun with `--require-tag`; diagnostic `--skip-automated-gates` runs
  are not release evidence and never write provenance.
- Run `IROHA_JS_SDK_RELEASE_REPO=<repo> IROHA_JS_SDK_RELEASE_TAG=<tag>
IROHA_JS_SDK_RELEASE_ASSET=<asset> IROHA_JS_SDK_RELEASE_SHA256=<sha256>
./scripts/audit-public-artifacts.sh` before enabling an Iroha browser SDK
  package in release builds. Use `IROHA_JS_SDK_VERSION=<version>` for a
  published npm package, or `IROHA_JS_SDK_TARBALL=<path>` for local
  release-candidate tarballs.
- Run
  `bash ./scripts/test-iroha-js-candidate-verifier.sh && bash ./scripts/verify-iroha-js-candidate.sh --replay-source &&
bash ./scripts/test-iroha-production-send-readiness-audit.sh && bash ./scripts/audit-iroha-production-send-readiness.sh`.
  Keep `VUE_APP_ENABLE_IROHA_TRANSFERS=false` while
  `config/iroha-production-send-readiness.json` is `blocked`. The pinned SDK
  vendored-artifact audit proves that the installed package is byte-for-byte
  identical to the reviewed 0.0.2 tarball (1,843,179 bytes, 141 files,
  SHA-256 `68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339`).
  The original upstream JavaScript asset is no longer downloadable, so the
  exact tarball is retained at `vendor/iroha-js/iroha-iroha-js-0.0.2.tgz` for
  durable fresh installs. The latest browser-codec security hardening is only
  in the unpublished local `0.0.3` candidate built from
  `b423c0f8bcd317fd945d6f66ce3fa679401dba7f` plus the frozen candidate patch;
  the pinned immutable `0.0.2` artifact still lacks it. Do not enable send until
  a reviewed `0.0.3` artifact and digest are published, checksum-pinned, bundled
  without the global test seam, the pinned native Safari QA remains green, and the documented live
  asset/fee/node/funded gates pass.
- Preserve the 2026-07-12 final-candidate evidence exactly. The exact tar and
  frozen patch are durably stored only as non-production evidence under
  `artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f`;
  the evidence manifest SHA-256 is
  `723c46192d369dac939f75d1ef1fb2f82456b3cd6afbd0ac51c0071383871a4d`
  and the patch SHA-256 is
  `b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049`.
  This path is pinned only through the development-only
  `@iroha/iroha-js-transfer-codec` alias used by the explicitly gated
  `transfer-test` profile; it is not the normal production dependency and the
  Store profile keeps Iroha send disabled. The test profile declares
  `legacy-offline-only` compatibility and blocks live Iroha submission before
  account lookup, mnemonic export, signing, or Torii access because the frozen
  candidate does not implement the current wire-protocol-v4 transaction form.
  The former `globalThis.__IROHA_NATIVE_BINDING__` seam has been removed.
  Candidate source replay is entirely offline from the stored bounded archive:
  2,412,361 compressed bytes, 15,319,040 expanded bytes, 305 entries, archive
  SHA-256 `cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c`,
  inventory SHA-256 `949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4`,
  and reconstructed subset tree `04fbf3b60512c7daf734d3f72c6a60ceb79316af`.
  It requires no live checkout or Git/network access; because it deliberately
  excludes tracked `node_modules`, it does not claim the full repository is
  bundled. The exact repack restores only the stored generated checksum
  sidecar, and the adversarial verifier passes 40 checks. None of this
  constitutes publication, independent review, or production dependency
  pinning/integration.
  Focused: browser/package 23/23, package/type 5/5, affected regression 220/220, package-dist 132/132, local crypto-adapter guard 8/8, Kagemusha static parity 76/76, changed runtime source/dist 6/6 exact, and broader packed runtime composition 14/14 exact.
  Full: final `node --test` has 2,317 total / 2,244 passed / 73 intentional skips / 0 failed / 0 cancelled / 0 todo.
  Quality: green ESLint, changelog, `build:dist`, bundle gate, and `git diff --check`; npm full/production audits report 0 vulnerabilities. The exact `0.0.3` tar contains 154 files and 154 archive entries, 1,281,259 packed bytes, 7,914,958 unpacked bytes, npm SHA-1 `8ee3a23653fc4e2648f81dc12ce5cf00d36b4439`, tar SHA-256 `15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8`, and integrity `sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==`.
  Historical frozen-candidate bundle (recorded 2026-07-12): exact esbuild `0.28.1`; Torii 854,715 bytes / 57 modules / cap 840 KiB; browser transaction codec 125,424 bytes / 36 modules / cap 132 KiB; browser Nexus 206,556 bytes / 45 modules / cap 205 KiB; canonical request 69,529 bytes / 31 modules / cap 75 KiB; browser IVM 9,644 bytes / 7 modules / cap 12 KiB; browser Kotodama 51,000 bytes / 6 modules / cap 51 KiB; and public aggregate 304,385 bytes / 51 modules / cap 300 KiB. All ten unique explicit browser export graphs passed Node-edge, static-Buffer, and runtime-Buffer guards with zero forbidden inputs and zero global-Buffer assignments. Preserve these as historical evidence; they are not the current upstream cap contract.
  Current upstream reviewed bundle contract (not immutable release-artifact evidence): at contract source commit `f6f8706977f5b3589ddbaea4d92f0e871b1cbe82`, exact esbuild `0.28.1` pins browser Nexus to a 215,950-byte / 46-module baseline under an exact 216 KiB cap and the public aggregate to a 314,580-byte / 52-module baseline under an exact 328 KiB cap. Both require zero forbidden Node inputs and zero global-Buffer assignments.
  Dirty-tree observation (not reviewed-baseline or release-artifact evidence): working tree `0fcb6a6961b8a15913c73a265a92877f69ceed4b` measured browser Nexus at 216,052 bytes / 46 modules and the public aggregate at 314,735 bytes / 52 modules, respectively 102 and 155 bytes above the reviewed baselines while still below their caps. The full check stopped on unrelated Torii at 933,497 bytes against 896 KiB. Production status remains blocked.
  Safari: **6 real Safari scenarios / 91 real Safari assertions / 0 failures** on native Safari 26.5.2. The replayable self-running loopback harness required neither WebDriver remote automation nor Apple-event JavaScript; both settings remained disabled. It bound the exact final tar, a random 32-byte nonce, exact IPv4 loopback origin, 91-assertion inventory digest `31b68d1c57fa6c652ceea255c43952bab43ef294358db31d31a4e03573543572`, and exact 1,127,726-byte / 79-input / 39-candidate-input bundle SHA-256 `f7781764f541f2c27b70b36f92bda81cddcad128918de73d67404746474a04ab`, then read a structured report through Safari's read-only document text property and closed only its owned window. Stored evidence SHA-256 is `02184886d34343924cfe9de378249759fb41b3430d2cd36ec83337955401368a`; contract/evidence/launcher negative checks pass 46/18/11. The older 1,648,973-byte static harness remains non-Safari compatibility evidence and is not counted. This closes only local Safari runtime QA, not publication, review, production integration, or live network gates.
  Nexus: payload hashes are recomputed at draft and finalize, canonical signed bytes/hashes are independently verified before submit, final hashes are mandatory, aliases must agree, caps precede copies, and no custom hasher bypass is accepted. The browser graph uses explicit Buffer and browser crypto/codec imports, bounded credentialless Fetch, descriptor snapshots with exact allowlists at every external-object boundary, and packed declarations without ambient Node types.
  Cross-language: four exact 27-entry families with fingerprint `f4f93f7ca4c6c244130e7bbd5b518df8`; Rust 1/1 data-model, 1/1 N-API, 20/20 exporter, and 17/17 xtask; JavaScript fixtures 22/22; Java 111/111; Kotlin 14/14; Python 47/47; Swift parity 11 executed / 5 expected ABI skips / 0 failures and broader changed-callsite 123 / 34 expected ABI skips / 0 failures. Frozen-candidate ABI-17 parity proves exact 6-proof/15-protocol inventories across Rust/C/Swift, exact Rust/C signatures for all 21 symbols plus `connect_norito_free`, header positive 1/1 and negative 15/15, JavaScript 76/76, and Swift V2 3/3. Keep the ABI 8 artifact versus minimum 14/frozen-candidate source 17 blocker explicit, and separately require a reviewed artifact and equivalent evidence for the current ABI-20 working source.
  Kagemusha V2 policy/Torii: 12/12 durable Torii-focused tests, 3/3 Core global-operation-ID tests, and 76/76 JavaScript static parity passed. `cargo check -p iroha_torii` has zero errors and 28 existing Core warnings; test builds expose 31 warnings from three additional test-only items. The main policy passed. Root/current OpenAPI specs are byte-identical at 663,006 bytes, SHA-256 `d773d734b5baddc20725982874ed7ef76320ab74e4b99402b2a36d4892764ae3`, and BLAKE3 `e771c3beac43c73b9628c7798b7401631b84508f8cd2fb3edc547124c157f960`. The manifest remains dirty (`665e6c059696facaadbd84e2f8203dc6aaf2a0bd8d24329e7774e4f0fe6ce36c`), unsigned, and has `generator_commit=null`; default/release verification rejects it and only explicit development `--allow-unsigned` passes. The redeem route advertises current 503 fail-closed behavior; 200 is conditional unreachable future behavior. OpenAPI xtask 20/20, portal 54/54, Torii 1/1, and CI checker pass. Keep V2 redeem fail closed until the canonical atomic operation-receipt backend exists.
  Confirm the strict Ed25519,
  canonical-metadata, bounds-first, defensive-byte-snapshot, shared compact
  vector, and cross-language raw-hasher checks remain green. This evidence does
  not replace publication, pinning, bundle integration, live preflight, or
  funded broadcast gates.
- Run `yarn test:smoke:bitcoin`,
  `yarn test:bitcoin-broadcast-evidence-template`,
  `yarn generate:bitcoin-broadcast-evidence-template -- --output
build/reports/bitcoin-broadcast-evidence-template.json`,
  `yarn test:bitcoin-broadcast-evidence-audit`, and
  `yarn audit:bitcoin-broadcast-evidence`. Before treating Bitcoin send as
  release-ready, use the generated template to prepare the manifest, run a
  funded live testnet broadcast with
  `FEARLESS_BITCOIN_TESTNET_LIVE=1 yarn test:smoke:bitcoin`, record the txid,
  outpoint, amount, source/recipient testnet addresses, canonical
  `https://blockstream.info/testnet/api` indexer URL, operator, timestamp, and
  commit in `scripts/bitcoin-testnet-broadcast-evidence.json`,
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
