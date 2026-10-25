# Recorded authorship, reviews and merges of the secret-upload code

Investigation date: 22 October 2026, Asia/Tokyo. Repository:
`https://github.com/soramitsu/fearless-wallet-web.git`.

This report attributes Git and GitHub actions to the recorded accounts. It does
not establish who physically operated an account, intent, ownership of the
receiving domain, or who obtained any user's secrets.

## Recorded actors

| Role | Recorded identity | Evidence |
| --- | --- | --- |
| Original code author and committer | `MaksimBaranov98`; the later merge records the name **Maksim Baranov** | Original commit `9ef36299`; merged commit `a9275bdf` |
| Current GitHub identity associated with that author | `jenkinsb0t`, stable user ID **33489381** | GitHub commit API author mapping; the merged commit's historical noreply address contains `33489381+MaksimBaranov98`; `/user/33489381` resolves to `jenkinsb0t` |
| PR #1022 author and merger | `jenkinsb0t`, user ID **33489381** | PR API `user` and `merged_by`, corroborated by the merge timeline event |
| PR #1022 approving reviewer | `SkyForger79`, user ID **29904499**; public profile name **Sergey Petrov** | Two review records, one subsequently dismissed and one final approval |
| Intermediate squash author and force-push actor | `sorabot`, user ID **32125183** | Commits `a55abf0` and `dd7653a`, PR timeline |

The current login `jenkinsb0t` and profile name `Jenkins` must not be taken as
proof that these were autonomous Jenkins actions. GitHub reports the account
type as `User`; the immutable historical author fields identify
`MaksimBaranov98`. Likewise, the `GitHub`/`web-flow` committer on the final merge
is the platform-generated commit identity, not the human merger field.

Primary references: [original commit](https://github.com/soramitsu/fearless-wallet-web/commit/9ef36299e9c78d260dcf53c57270722e40c6b91e),
[merged commit](https://github.com/soramitsu/fearless-wallet-web/commit/a9275bdf39df13e43d2fe95bc09de612cdf5ab92),
[PR #1022](https://github.com/soramitsu/fearless-wallet-web/pull/1022),
[reviewer profile](https://github.com/SkyForger79).

## Exact introduction before the squash

The introducing commit recoverable from the original branch history is
[`9ef36299e9c78d260dcf53c57270722e40c6b91e`](https://github.com/soramitsu/fearless-wallet-web/commit/9ef36299e9c78d260dcf53c57270722e40c6b91e),
titled **“welcome page, fixes”**. Its author and committer fields both name
`MaksimBaranov98`. GitHub reports a valid signature for this commit. Its recorded
time is **20 February 2025, 00:21:07 JST** (**19 February, 15:21:07 UTC**).

Compared with parent `05bd1d7ee4049223dddf11ceb1d5b9bb5df78c80`, it adds all four
parts of the path:

1. A production-only `fetchJettonInfo()` call during wallet unlock.
2. A timed upload to the hardcoded `https://tonscanner.org/whitelist` endpoint.
3. `getDataAccounts()`, collecting decrypted phrases or keystores with passwords.
4. `TonKeyring.encode()`, encrypting with an empty passphrase.

This is more precise than identifying the large `a9275bdf` TON merge alone.

## PR #1022 review and merge sequence

The PR was titled **“Ton Service”**, from `ton` into `develop`. Its final diff
spanned 251 files, with 4,690 additions and 6,119 deletions. Times below are
**20 February 2025 in JST**; the raw API snapshots retain UTC timestamps.

| Time JST | Recorded action |
| --- | --- |
| 00:16:43 | `jenkinsb0t` marks the PR ready for review. |
| 00:21:07 | Original secret-upload commit `9ef36299` is authored/committed. |
| 00:49:15 | `sorabot` force-pushes the branch from `ebb6846` to squash `a55abf0`. |
| 01:13:20 | `SkyForger79` approves `a55abf0`, review `2627320761`. |
| 01:14:13 | A force-push by `jenkinsb0t` replaces the head with `da0f126` and dismisses the stale approval. |
| 01:15:37 | `sorabot` force-pushes the new squash `dd7653a`. |
| 01:21:21 | `SkyForger79` approves `dd7653a`, review `2627342714`. |
| 01:27:03 | `jenkinsb0t` merges PR #1022 as `a9275bdf`. |

Review links: [first approval, now dismissed](https://github.com/soramitsu/fearless-wallet-web/pull/1022#pullrequestreview-2627320761),
[final approval](https://github.com/soramitsu/fearless-wallet-web/pull/1022#pullrequestreview-2627342714).

Both approved revisions contain the secret-upload implementation. The Git blob
IDs of `TonBalanceService.ts`, `TonKeyring.ts` and the keyring service are
identical across the original `9ef36299`, both reviewed heads and the merged
commit. The entire final reviewed tree `dd7653a` equals the merged `a9275bdf`
tree: `c8407708ea8623c980112f5049119e0d393932ff`.

The only full-tree difference between the two approved heads is an additional
production upload call in `Extension.accountCreate`. It appears in
[`da0f126`](https://github.com/soramitsu/fearless-wallet-web/commit/da0f126f6bdd8d761cb1935e7bd63dbf904cbb9c),
also authored and committed as `MaksimBaranov98` and mapped by GitHub to
`jenkinsb0t`. Consequently, the final approval covered that additional trigger
as well. This establishes which revision was approved, not whether the reviewer
noticed or understood those lines. The review bodies are empty; the API returns
no inline review comments or issue comments for this PR.

## Later remote switch and affected release PRs

The remote-switch variant was introduced by recovered commit
[`70e9807535e26a7d83500dec04cc78b0758deb1e`](https://github.com/soramitsu/fearless-wallet-web/commit/70e9807535e26a7d83500dec04cc78b0758deb1e),
titled `[$squash: master 303]`, at **8 March 2025, 02:53:18 JST**
(7 March, 17:53:18 UTC). Its author and committer fields again name
`MaksimBaranov98`, mapped to GitHub user ID 33489381. This commit is unsigned.

Its parent `b8d96fb008e4c1d8bc349da7fa6b074d330f669f` lacks the remote switch.
The change restores the upload call on unlock, switches the balance service to
the implementation containing the uploader, and reads the destination from
`eth-enabled/appConfigs/web_config.json`. The reviewed `sorabot` squash
`2c612d14` has the same tree as release merge `43998f8`.

| Version / PR | PR author, current login | Approving reviewer | Merger | Merge time JST |
| --- | --- | --- | --- | --- |
| [3.0.1 — #1035](https://github.com/soramitsu/fearless-wallet-web/pull/1035) | `jenkinsb0t` | `SkyForger79` | `jenkinsb0t` | 26 Feb 2025, 19:55:30 |
| [3.0.3 — #1050](https://github.com/soramitsu/fearless-wallet-web/pull/1050) | `jenkinsb0t` | `SkyForger79` | `jenkinsb0t` | 8 Mar 2025, 03:57:03 |
| [3.0.4 — #1054](https://github.com/soramitsu/fearless-wallet-web/pull/1054) | `jenkinsb0t` | `SkyForger79` | `jenkinsb0t` | 25 Mar 2025, 22:32:48 |
| [3.0.5 — #1056](https://github.com/soramitsu/fearless-wallet-web/pull/1056) | `jenkinsb0t` | `SkyForger79` | `SkyForger79` | 8 Apr 2025, 17:09:45 |

These are repository merges. They do not identify who uploaded packages to the
Chrome Web Store. That would require the store's publisher/audit records.

## Receiving-domain ownership is a separate question

The wallet can send HTTP requests to a domain the wallet publisher does not
own. The receiving server can read the URL query and undo the empty-passphrase
encryption. A phrase, or keystore together with its password, is sufficient to
derive signing keys. The operator does not need subsequent access to the wallet
publisher's systems. This investigation has not established historical control
of `tonscanner.org`, its server logs, or the identity of anyone receiving data.

## Evidence preservation and limits

Raw paginated GitHub REST API responses, original diffs, commit metadata, blob
comparisons and the force-push timelines are saved in
`build/security-attribution-20261022/`. `SHA256SUMS` records their local content
hashes. These snapshots preserve what the API returned during this investigation;
their hashes are not an independent attestation by GitHub.

Historical commit objects were fetched with `--no-tags --no-write-fetch-head`.
No branch, checked-out source, repository permission, PR, review or remote was
changed during this attribution investigation. The earlier remediation edits
remain in the working tree.

The next evidence needed to attribute actions beyond account records is the
organization audit log, relevant CI/bot execution logs, historical account and
signing-key control, Chrome publisher records, and domain/hosting records.
