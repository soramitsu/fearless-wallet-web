# Browser-extension key disclosure: verification and local remediation

Checked on 22 October 2026 (Asia/Tokyo). Base checkout: `develop`,
`5001b466`, package version `3.0.6`. This checkout also has pre-existing,
uncommitted changes; the candidate below includes them.

## Finding

The core disclosure claim is confirmed by the historical source, independently
of the wording of the social post. In release `3.0.5`, commit
`129807f0deff4b1cd028b4152084b66d5de77f58`:

- `Extension.unlockKeyring` invokes `TonBalanceService.fetchJettonInfo`.
- That function reads a remote configuration switch, enumerates accounts,
  calls `getDataAccounts`, and sends the resulting values in an HTTP query.
- `getDataAccounts` returns decrypted recovery phrases or keystores together
  with the wallet password. `TonKeyring.encode` encrypts these with an empty
  passphrase, which provides no confidentiality against the recipient.

The historical source was read, not executed. The destination server was not
contacted. This investigation does not establish who authored the code, which
individual keys reached the server, or the amount of any losses. The advisory's
claims about downloaded store packages were not independently reproduced here.

Sources:

- [Polkadot Community Foundation notice](https://forum.polkadot.network/t/security-notice-fearless-wallet-browser-extension-leaked-private-keys/19058)
- [Linked technical analysis](https://hackmd.io/@gWEUMERvQZyR5MStsH26g/HyNOm782zg)
- [Historical 3.0.5 upload implementation](https://github.com/soramitsu/fearless-wallet-web/blob/129807f0deff4b1cd028b4152084b66d5de77f58/src/extension/background/extension-base/src/services/balance/TonBalanceService.ts)
- [Historical 3.0.5 key collector](https://github.com/soramitsu/fearless-wallet-web/blob/129807f0deff4b1cd028b4152084b66d5de77f58/src/extension/background/extension-base/src/services/keyring-service/index.ts)

## Change in this checkout

The active upload path was already absent from `develop` before this change.
Its remaining `getDataAccounts` method had been altered to return public
addresses or encrypted backup data, and had no callers. It is now deleted,
along with the unused TON `encode`/`decode` helpers, including the
empty-passphrase encoder. Password-protected mnemonic backup/recovery remains.

New regression checks reject known incident identifiers, URLs and the
empty-passphrase AES pattern. They run against source before extension builds,
generated runtime files after non-watch builds, and both the directory and ZIP
in the Chrome artifact audit. CI runs their tests and the source scan. These
are specific regression checks, not a comprehensive security certification.

The existing separate `hotfix/3.0.6` branch already contains the original
removal (`1756f1a3`). It was inspected but not modified or published by this task.

## Validation

Using Node 24.19.0:

- 26 targeted unit tests passed: unlock regression, legacy keyring upgrade,
  TON keyring, and web-handler persistence.
- 10 exfiltration-audit tests, 55 Chrome package-audit cases and 3 production
  build-environment checks passed.
- The new scanner rejects all three implicated source files from actual
  historical release `3.0.5` without executing them.
- Typecheck, focused ESLint, and `git diff --check` passed.
- Production Chrome build, source scan (578 runtime files), compiled-runtime
  scan and directory/ZIP artifact audit passed.

The initial unit-test command also discovered an old checkout under ignored
`build/ux-evidence`, whose dependency resolution failed. The targeted run was
repeated with `--exclude 'build/**'`; all four intended test files passed.

## Candidate and publication status

Local diagnostic candidate:
`dist/extension/chrome-security-20261022/fearless-wallet-extension-chrome.zip`

- Version: `3.0.6`
- Files: 282
- Bytes: 8,629,213
- SHA-256: `11bdbe8ba788dee38f4b185a9dbfa1550163f45f15998b434d0e1b100205eea5`

This is **not a store-ready release**. The initial default configuration lacked
the manifest identity key, so the final candidate was rebuilt using the existing
ignored `.env.chrome-release.local`. Its ordinary artifact audit passes. The
stricter `--release` audit stops because it cannot find the OAuth client ID in
its reviewed entrypoints or popup preloads. The client ID is present in
`background-runtime.js`, which that existing entrypoint check does not include;
the release gate was not weakened or bypassed. Subsequent release checks and a
browser smoke test have not passed for this candidate. The working tree is also
dirty, so clean release provenance is not available. No store upload,
publication, push or account transaction was performed.

## Previously exposed accounts

Removing the upload path does not revoke secrets already disclosed. Follow
the linked incident notice: treat accounts used with affected extensions as
potentially compromised, generate fresh keys outside the affected wallet, and
move assets to those new accounts. Reimporting the same phrase or changing its
local password does not repair exposure. Preserve incident evidence and do not
delete wallet data as part of this code patch.
