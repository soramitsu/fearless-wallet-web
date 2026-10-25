# Real legacy-build upgrade E2E (WK-5)

Users' profiles are written by the released extension code itself, built from its own commit and lockfile, and then
upgraded with a real in-place extension update to this tree's production build. Nothing is simulated with this
tree's libraries (addendum invariant U0.6): the "before" state of every scenario is what a released build stored in
`chrome.storage.local` when driven through its own background messages.

```sh
yarn test:upgrade:e2e                    # build the released versions (cached), build this tree, run every scenario
node scripts/upgrade-e2e/run.mjs S3 R1   # selected scenarios against the cached builds and dist/extension/chrome-upgrade-e2e
yarn test:upgrade:snapshot               # also store each released build's profile as tests/fixtures/upgrade/<version>/<state>.json
```

Needs Node 20 for the released builds (`/opt/homebrew/opt/node@20`, or `UPGRADE_E2E_NODE20_BIN`), Node 24.19.0 for this
tree, and Chrome for Testing (`CHROME_BIN`, else the newest one in Playwright's cache; branded Chrome ignores
`--load-extension`). The report is `output/upgrade-e2e/<run>/report.json`, one `<scenario>.json` per scenario; the
command exits non-zero on any failed assertion.

The 3.0.6 fixture remains pinned to `cfcdb591`. Its Vue CLI thread-loader can stall
with pending Vue TypeScript jobs on newer hosts. The harness uses a separate
configuration wrapper with `parallel: false` for that build; its source files,
immutable lockfile, type checks and production optimizations are unchanged.
`provenance.json` records this compiler scheduling override. Browser cleanup is
bounded and escalates only the child launched by the harness if it ignores SIGTERM.

Popup retries open a fresh extension page to wake an idle worker. They do not wait for a worker after closing the
failed page, and three unanswered attempts fail the scenario. Readiness requires a reply received over the port;
a rejected send on a disconnected port is not an answer. Each attempt retains the same 20-second response deadline.

On an unanswered popup, worker timeout or scenario failure, `browser-diagnostics.json` records bounded process
state, native stderr categories, target lifecycle changes, and extension error counts/source locations. Arbitrary
stderr, console messages, message payloads and wallet storage are excluded. CI uploads only the summary report and
these sanitized diagnostics, never the browser profiles or keyring directories. A successful local retry does not
erase an earlier failed CI run or establish the cause of its timeout.

## What runs where

| Piece | File |
| --- | --- |
| Released builds and their commits | `tests/upgrade/legacy-builds.json` |
| Build a released version from its own lockfile (`git archive`, Node 20, `corepack yarn@3.4.1 install --immutable`, `yarn build:extension`), cached with provenance in `~/.cache/fearless-upgrade-e2e/<id>/` | `scripts/upgrade-e2e/build-legacy.mjs` |
| This tree's production build with the test key, in `dist/extension/chrome-upgrade-e2e` (the release artifact is not touched) | `scripts/upgrade-e2e/build-head.mjs` |
| Chrome for Testing over raw CDP, in-place update via `chrome://extensions` reload, cold-start probe | `scripts/upgrade-e2e/chrome.mjs`, `session.mjs` |
| What each release's UI sends to its background to create wallets | `scripts/upgrade-e2e/drivers.mjs` |
| The 3.0.x keyring (`@subwallet/keyring` 0.1.7, `@polkadot/util-crypto` 12.6.2) from the 3.0.5 lockfile's archives | `scripts/upgrade-e2e/keyring-305.mjs` |
| A dApp page on localhost (Substrate `signRaw`, EVM `personal_sign`) | `scripts/upgrade-e2e/dapp/` |
| Local stand-ins for the chain registry and TI (TON indexer), over a per-run throwaway certificate | `scripts/upgrade-e2e/mock-services.mjs` |
| Scenarios and assertions | `scripts/upgrade-e2e/scenarios.mjs`, `checks.mjs`, `head.mjs`, `upgrade-ecdsa.mjs` |
| Public test secrets (BIP39 vectors, //Alice, Hardhat #0, a native TON phrase from a fixed seed) | `scripts/upgrade-e2e/secrets.mjs` |
| Unit checks over the captured profiles | `tests/unit/genuine-legacy-profiles.spec.ts` |
| CI (nightly, on demand, and on PRs touching keys, routing or the lockfile) | `.github/workflows/upgrade-e2e.yml`, `scripts/upgrade-e2e/install-cft.sh` |
| Release gate | `scripts/prepare-chrome-release.mjs` (`--skip-upgrade-e2e` is recorded in provenance, refused with `--require-tag`) |

Every build carries the public half of a throwaway RSA key (`test-extension-key.pub.b64`), so all of them get the
extension id `plnlnnlkcnkiokjgpefakfhgngpbnaec` and share one `chrome.storage.local`, as a Web Store update does. Builds
that refuse to load without an OAuth client id get the placeholder `000000000000-fearless-upgrade-test…`.

### Network

Every browser starts with `--host-resolver-rules` that make every host name unresolvable except localhost and two
host names mapped to a local stand-in: `raw.githubusercontent.com` serves only the chain registry snapshot
(`tests/fixtures/legacy-305/chains-v13.snapshot.json`; an EVM signature needs the dApp's network from it), and
`ti.soramitsu.io` answers TI's own routes (service-info proving `ton:mainnet`, balance, state, seqno) and records each
`sendBoc` without forwarding it. The stand-in's certificate is made per run; only the test browser accepts it
(`--ignore-certificate-errors`). Every other request fails to resolve. No secret leaves the machine, no transaction is
broadcast, and the collection host of the published 3.0.5 is never resolvable.

### Released builds

| id | commit | why |
| --- | --- | --- |
| 3.0.5 | `600a64d5` (`origin/stage`) | 3.0.5's keyring and storage code **without** the phrase upload the Web Store package (`129807f0`) carries. `129807f0` and the published package are never built or run. |
| 3.0.6 | `cfcdb591` (`hotfix/3.0.6`) | The clean rollback target: the published 3.0.5 minus the upload path, with AUDIT-01, AUDIT-02 (TON phrases stored as version 2, or version 3 for an earlier password) and the availability fixes. R1 rolls back to it. Builds before it read only version 1 TON records, which 4.2.0 no longer writes. |
| 2.7.1 | `39541eb7` | First release with a master password. |
| 2.6.3 | `1d515acf` | Last release with per-account passwords. |
| 2.0.1 | `8a96facd` | Per-account passwords, older account metadata. |
| 1.3.1 | `5a8b7f10` | Per-account passwords. Its UI kit `@soramitsu/soramitsu-js-ui` 1.0.46 existed only on the retired `nexus.iroha.tech`, so it is replaced by an empty stub (`scripts/upgrade-e2e/stubs/soramitsu-js-ui`) and installed without `--immutable`; `provenance.json` records the lockfile delta, which is that package's own subtree and nothing else. The service worker, which owns the keyring and storage, is the real one; the popup is not used. |

## Scenarios

Passwords include a non-ASCII master password (`Pässwörd-日本語-🔐`).

| id | Released build(s) and profile |
| --- | --- |
| S1 | 2.6.3, per-account passwords: Alpha (12 words + Ethereum, pwA), Bravo (24 words + Ethereum, non-ASCII pwB), Charlie (two JSON files written by the 3.0.x keyring library: Substrate under pwC1, Ethereum under pwC2), Delta (raw sr25519 seed //Alice + Hardhat #0 key, pwD), Echo (an Ethereum JSON file on its own, pwE). |
| S2 | 2.6.3 (Alpha, Bravo, Charlie) → 3.0.5: master password, migrate Alpha and Bravo, Charlie with pwC1 (3.0.5 migrates Charlie and fails on its Ethereum account), add a native TON and a BIP39 TON wallet. |
| S3 | 3.0.5: master password; a created wallet; a 24-word import; a raw seed; the 2.6.3 Staking JSON file; "Add Ethereum account" to that wallet; a created native TON; TON from a BIP39 phrase; TON from a native phrase; the second wallet current. |
| S4 | S3, then the master password changed in 3.0.5 (which leaves the TON phrases under the old one), then one more TON wallet. |
| S5 | 2.7.1: master password, a created wallet, a 24-word import, a raw seed. |
| S6 | 3.0.5: wallets and two TON wallets, Reset wallet (TON phrases stay, E15), a new master password and a new wallet. |
| S7 | 1.3.1 per-account passwords (Alpha, Bravo, Charlie). |
| S7b | 2.0.1 per-account passwords (as S1). |
| S8 | 3.0.5: master password, an Ethereum JSON file restored first (standalone, first in storage), then a wallet; the current-account record removed from the profile. |
| ECDSA-2.6.3, ECDSA-3.0.6 | ECDSA Substrate accounts, which 2.x/3.0.x store under the blake2 hash of the public key and 4.2.0 under the key (WK-8); rename, password change, legacy migration, deletion and reset across restarts. |
| R1 | Rollback (critique T-8): the S4 profile plus an ECDSA wallet → 4.2.0, which writes in every way it encrypts a key (TON recovery with the earlier password, a new wallet, a JSON import, a new TON wallet, a master password change, deleting a wallet into `fw:deletedWallet:`) → **hotfix 3.0.6** → 4.2.0 again. |

## Assertions (web-keys.md §6.4)

| id | Checked |
| --- | --- |
| A0 | At the first start of 4.2.0, every `fw:account:*`, `fw:ton:*` and `fw:keyring` record is still there and `encoded`, `cipherSeed`, `passwordHash`, `address`, `encoding` are byte-identical. |
| A1 | The popup opens on Unlock or on the per-account password prompt (never a dead end), and the scripted path through the real screens (prompt, master password, rows, Skip, the 3.0.x security notice) reaches the wallet. |
| A2 | The master password unlocks, a wrong one does not, the stored hash is unchanged. |
| A3 | Every historical Substrate account rejects public dApp authorization with the recovery-only policy error, without granting access or returning a signature. Its exported JSON key still signs a message that verifies against the original secret's public key. |
| A4 | Every historical Ethereum account rejects public dApp authorization with the recovery-only policy error, without granting access or returning a signature. Its exported private key still signs a message that recovers the original address. |
| A5 | The exported phrase is the original where the released build stored one (never a different one where it did not); the JSON export opens with the master password to the original key and is at N = 2^15; the exported Ethereum key is the original. |
| A6 | Every TON phrase exports exactly as stored; every TON wallet sends a transfer through the TI stand-in whose external message is signed by the stored public key with the seqno TI reported. |
| A7 | Per-account profiles: `pri(keyring.getMigrationAccounts)` over the real port returns plain rows; one DOM row per waiting key; a wrong password changes nothing; each password moves its keys; a different Ethereum password keeps that account waiting until its own row; Reset wallet is reachable but not run; Skip opens the wallet with the reminder and leaves waiting records byte-identical; a restart unlocks to the wallet; Account access opens a forgotten key with its phrase. In S2 the waiting Ethereum account does not force the prompt. |
| A8 | TON phrases a 3.0.x password change or reset left under an earlier password: Account access lists exactly those; export answers a recovery code, never `''`; a wrong earlier password writes nothing; the right one re-encrypts; a later password change in 4.2.0 keeps every phrase exportable. |
| A9 | Cold starts: the first messages after the worker starts see `hasMasterPassword = true`, a locked keyring and the accounts (W10). |
| A10 | Three restarts with unlock leave keys, archives, the notice record and the current account unchanged. |
| A11 | R1: every key 4.2.0 stored, and every key it set aside, is at N = 2^15 and opens in the 3.0.5 keyring; 3.0.6 unlocks with the 4.2.0 password, lists and exports every wallet (keys sign, phrases equal, TON phrases equal), does not list the deleted wallet, and imports its set-aside records as JSON files; 4.2.0 then lists each wallet once and does not add the re-imported one twice. |
| W10 | The current account survives the upgrade (S3); with none stored, 4.2.0 picks the wallet, not the standalone Ethereum account (S8). |

## Results

### Final audit source, 14 October 2026 JST

Clean `ba8798b7af5df6900b83137b4e692373557fa872` passed all12 scenarios and482 checks with Node24.19.0 and Chrome for Testing147.0.7727.15. The run completed at `2026-10-13T21:26:50.870Z`. Report SHA256 `acd96fceea2fae356c2c6ef626c3ca427109661aee4b456fafb733467634a6ad`; the report and original profiles are in the parent `build/safe-upgrade/evidence/codex-20261012/web-final-upgrade-matrix-v1`. `final-source-validation.json` binds the318-file candidate artifact,503 checked legacy files, source tools and a complete hashed run inventory.

This final-source rerun includes exact export, wrong-password rejection, migration/recovery, worker restarts/cold starts, ECDSA record ownership and R1 clean3.0.6 rollback. All network operations use local stand-ins with external DNS denied. It qualifies the production-mode test-key artifact, not store-signed distribution, Firefox upgrades, Linux CI or every required cohort. The1.3.1 background-only/UI-kit-stub boundary remains explicit.

### Earlier integrated result

The integrated production-mode test artifact at clean `3ec8623ba271be5f2ba7475f815cf650c4827277` passed all 12 scenarios and 482 assertions on 12 October 2026 with harness `dfb43b85`, Node 24.19.0 and Chrome for Testing 147.0.7727.15. The run completed at 05:05:35 UTC. Report: `build/safe-upgrade/evidence/codex-20261012/wk5-integrated-document-probe/report.json` in the parent workspace; SHA-256 `25c3fa6dae6c6c43282e60005bd765b6021cc0f9700516e70128313b920fc566`. It includes every first-response cold-start assertion, historical key/sign/export checks and R1 clean rollback. This qualifies that cached test artifact; final distribution artifacts, Linux CI and signed Firefox upgrades retain their separate gates.

### Earlier failed integrated run

The integrated production-mode test artifact at clean `3ec8623ba271be5f2ba7475f815cf650c4827277` completed 11/12 scenarios on 12 October 2026 (`wk5-integrated-2/report.json` in the parent evidence directory). S1 passed 48/49 checks: cold start 7/20 received no CDP evaluation result, including no result from its in-page 60-second timer, before the 180-second driver timeout. The other 19 starts and all key/sign/export checks passed. This run is **not** a passing upgrade gate.

The cold-start harness now installs its probe before navigating the extension document and polls plain progress snapshots instead of holding an asynchronous evaluation across page creation/navigation. The three first requests are issued immediately in the document and are never retried or replaced by the later comparison responses. Disconnects and unanswered messages still fail the assertion. Eight driver tests cover those properties and CDP failure handling. The targeted S1 rerun passed 49/49 checks and 20/20 cold starts, followed by the full passing matrix above. No application startup fix or proven root cause is claimed from this harness change.

### Earlier lane result

On 12 October 2026, all 12 scenarios passed on macOS with Chrome for Testing 147.0.7727.15. No assertions failed. The report is in the parent workspace at `build/safe-upgrade/evidence/codex-20261012/wk5-full/report.json`.

The tested cached artifact was built from clean source `45917e8f797bd3bc1d29d29342b982a1051ae9d0`, version 4.2.0, Node 24.19.0. Harness source was `b4e759c3`. Application source had not changed between that build and the harness run. This does not qualify subsequent design-lane or integration changes: rebuild and rerun on the final source before release.

| Scenario | Passed assertions |
| --- | --- |
| S1 | 49 |
| S2 | 34 |
| S3 | 37 |
| S4 | 54 |
| S5 | 24 |
| S6 | 31 |
| S7 | 40 |
| S7b | 49 |
| S8 | 18 |
| R1 | 98 |
| ECDSA-2.6.3 | 21 |
| ECDSA-3.0.6 | 27 |

Total: 482 passed assertions. Report SHA-256: `4b976c5cedef8ed558d59c99c5c2e0cd02e5c7da059cda5361a82074f91eddc5`.

The preceding full run had S3/S6 CDP timeouts. Both passed a targeted rerun and this complete rerun; no application fix or proven timeout root cause is claimed. The driver now rejects disconnects promptly and logs caller stacks and cold-start timings. All five driver tests pass. Original failed logs are retained.


## Firefox (critique T-15)

The Firefox build is the same source with `EXTENSION_TYPE=firefox`; the keyring, storage and migration code is shared.
`tests/unit/genuine-legacy-profiles.spec.ts` runs that shared logic against the profiles the released builds wrote, so it
covers the Firefox build's code too. A real in-place upgrade from an AMO-installed 3.0.5 in Firefox was not run: this
harness drives Chromium over CDP, and Firefox loads an unsigned build only as a temporary add-on that goes away with
the browser session, so a store update across restarts needs signed XPIs. Before an AMO release, do the manual upgrade
listed in `docs/release-checklist.md` or record a written risk acceptance.

## Not covered here

- The published Web Store 3.0.5 package itself is never run (it uploads phrases on unlock). Its keyring and storage
  code is that of `600a64d5`, which is what the scenarios build; the hotfix lane diffed the two.
- Linux CI has not been executed in this local run. Its pinned Chrome-for-Testing archive checksum was verified from the official download and is recorded in `scripts/upgrade-e2e/install-cft.sh`; macOS results do not stand in for a CI run.
