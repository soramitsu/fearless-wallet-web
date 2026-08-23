# Chrome Web Store release 3.0.6

This is the release handoff for the production Chrome artifact. The live Chrome
Web Store version was `3.0.5` when checked on 2026-08-23, so the next upload is
`3.0.6`.

Store listing: <https://chromewebstore.google.com/detail/fearless-wallet/nhlnehondigmgckngjomcpcefcdplmgc>

## Release scope

- Universal Wallet v2 account derivation and migration, with legacy wallets
  retained for export-only recovery.
- Solana accounts, balances, dApp authorization, message signing, and
  transaction signing.
- Bitcoin account discovery, balances, and history. Bitcoin sending is hidden
  and rejected by the background API in this release because the funded
  testnet broadcast evidence is not ready.
- Iroha Nexus and Taira accounts, balances, and dApp authorization. Iroha
  sending remains disabled until its reviewed browser SDK artifact and live
  release evidence are ready.
- Reliability and fail-closed handling across network, signing, and transfer
  flows.

Suggested short release note:

> Fearless Wallet 3.0.6 adds Universal Wallet v2 migration, Solana dApp and
> signing support, Bitcoin balances and history, Iroha account support, and
> reliability improvements. Bitcoin and Iroha transfers remain disabled while
> their release evidence is completed.

## Permission justifications

Use these as the basis for the Chrome Web Store permission explanations. The
release owner must confirm that the text matches the final signed artifact.

| Permission                               | Product purpose                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                | Store encrypted wallet/account records, settings, network state, and dApp authorization state locally in the extension profile.                                                          |
| `tabs`                                   | Reuse or open Fearless Wallet tabs for authorization and Google Drive backup/restore flows.                                                                                              |
| `identity`                               | Run the user-initiated Google OAuth flow for optional backup/restore in the user's private Drive app-data folder.                                                                        |
| `clipboardRead`                          | Paste an address or WalletConnect payload only after a user invokes the paste action.                                                                                                    |
| `alarms`                                 | Schedule background refresh and subscription maintenance while the extension is installed.                                                                                               |
| `<all_urls>` and HTTP(S) content scripts | Inject the wallet provider on dApp pages selected by the user and connect to user-selected chain RPC/indexer endpoints. No provider account is exposed until the user approves the site. |

The extension requests Google Drive's narrow
`https://www.googleapis.com/auth/drive.appdata` scope. A backup consists of the
password-encrypted wallet JSON plus the wallet label and public address used as
Drive file metadata. The feature is absent from public/credentialless builds
and only appears when the release OAuth client is supplied.

The Chrome manifest requires Chrome 102 or newer. This matches the first
Manifest V3 Chrome release that accepts the extension's required
`wasm-unsafe-eval` CSP directive.

## Local production configuration

Jenkins is not required. The exact public client-side configuration from the
published `3.0.5` package can be imported without printing or committing its
values:

```sh
curl --fail --location --output /tmp/fearless-wallet-3.0.5.crx \
  'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=151.0.7922.172&acceptformat=crx2,crx3&x=id%3Dnhlnehondigmgckngjomcpcefcdplmgc%26uc'
yarn import:chrome-release-config --crx /tmp/fearless-wallet-3.0.5.crx
```

The importer accepts only the inspected `3.0.5` CRX SHA-256
`be6e2d4c4cb8072ced8e3813f470db914ef657d2c301425d4a7979f936b31704`,
validates the stable extension ID, and writes `.env.chrome-release.local` with
mode `0600`. That path is ignored by Git. Run credentialed build/smoke commands
through `env-cmd -f .env.chrome-release.local -- ...`.

Run from a fresh checkout after committing the reviewed source. This prepares
an untagged candidate for review:

```sh
yarn env-cmd -f .env.chrome-release.local -- yarn prepare:chrome-release
```

It requires the exact Node/Yarn toolchain, runs the full test suite and release
self-tests after `yarn install --immutable --check-cache`, verifies the exact
vendored Iroha 0.0.2 archive and its installed contents byte-for-byte, builds twice and
requires identical ZIP hashes, audits the real store identity and compiled
public configuration, performs the production Chrome smoke, rechecks the clean
source commit, and writes a non-secret
`dist/extension/chrome-release-provenance.json` report with status
`untagged-candidate`. The production build forcibly disables test-only, smoke,
Bitcoin-send, and Iroha-send flags and the artifact audit verifies those values
in `extension-build-metadata.json`.
The runner isolates Vitest and development-extension gates under
`NODE_ENV=test`; credentialed production builds and their smoke remain under
the audited `NODE_ENV=production` release environment.

After the reviewed merge commit is tagged `3.0.6` or `v3.0.6`, rerun the exact
tagged artifact gate:

```sh
yarn env-cmd -f .env.chrome-release.local -- yarn prepare:chrome-release --require-tag
```

The `--skip-automated-gates` option is diagnostic only: it invalidates any old
provenance report and never writes a replacement.

## Privacy dashboard handoff

The current store listing says that the developer does not collect user data.
Before submission, the privacy/legal owner must reconcile that declaration
with the final product behavior and the store's current disclosure form. At a
minimum, review these handled data categories:

- authentication information: encrypted wallet material and dApp approvals;
- financial information: public wallet addresses, balances, and transaction
  history fetched from chain services;
- website activity: the origin of a dApp requesting connection/signing;
- optional Google Drive backup data described above.

Document that private keys and seed phrases stay under user control, approved
dApps receive only the approved public account, and data is not sold or used
for advertising or credit decisions. Do not submit until the public privacy
policy explicitly covers the browser extension, all-url provider injection,
local wallet processing, external RPC/indexer requests, and optional Google
Drive backup/restore.

Policy references:

- <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
- <https://developer.chrome.com/docs/webstore/program-policies>

## Exact release gates

Run the authoritative gate with the repository's exact Node 24.19.0 and Yarn
4.17.0 toolchain:

```sh
yarn env-cmd -f .env.chrome-release.local -- yarn prepare:chrome-release
```

This command covers the immutable dependency/cache install and vendored Iroha
SDK audit; branch-flow,
public-artifact, TODO, Iroha candidate/readiness, dependency, crypto-shim, and
stored Safari QA gates; typecheck, lint, unit, web-build, extension E2E, and
Bitcoin blocked-send/evidence gates; release-tool adversarial tests; two
credentialed Chrome builds; byte-identical reproducibility; the release
artifact audit; and the production popup smoke. The tagged rerun adds
`--require-tag` as shown above.

The production smoke and release audit must both run with
`EXTENSION_PUBLIC_KEY` and `OAUTH_CLIENT_ID` supplied through an ignored local
environment file or credential manager. The smoke checks background readiness;
the artifact audit confirms the OAuth client is compiled into extension
JavaScript. The `key` preserves the installed extension ID used by the existing
store item; the OAuth client must be registered for that same extension ID.
Never commit either value. The release command refuses a dirty source checkout
and invalidates stale provenance before any checks or builds; use
`yarn audit:chrome-release:artifact` only to inspect a local candidate that has
not reached the provenance gate.

## Human/external gates

- Review and commit the complete dirty working tree on a release branch; tag
  only the reviewed merge commit. A ZIP built from an unreviewed dirty tree is
  not a releasable artifact.
- Approve and publish the browser-extension privacy-policy update, then update
  the Chrome Web Store privacy declarations and permission explanations.
- Load the production extension public key, Google OAuth client, and existing
  public client-side service configuration from an ignored mode-600 local file,
  then confirm the audit reports the existing store ID
  `nhlnehondigmgckngjomcpcefcdplmgc`.
- Review updated screenshots, detailed description, supported-ecosystem copy,
  and the release note above in the store dashboard.
- Record the exact ZIP SHA-256, source commit, CI run, reviewers, rollback
  owner, and rollout/monitoring owner before upload.

Chrome requires the uploaded ZIP to contain `manifest.json` at its root and a
higher version than the currently published item. The automated release audit
enforces those artifact properties; the Chrome Web Store upload and staged
rollout remain release-owner actions.
