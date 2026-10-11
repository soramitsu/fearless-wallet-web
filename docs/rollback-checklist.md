# Rollback Checklist

Use this when a released browser extension causes a production-impacting issue.

## Trigger

- Stop rollout when install/update failures, wallet migration failures, signing
  failures, dApp provider regressions, or indexer-backed read failures exceed
  the release threshold.
- Assign one incident owner and one communication owner.

## Immediate Actions

- Identify the last known-good `master` tag and current store rollout state.
- Capture failing version, browser version, feature flags, extension manifest
  details, and relevant backend/indexer status.
- Disable remote config or feature gates first when that removes the issue
  without republishing. A remote `false` in `web_config.json` `actions` is a
  sticky veto; lift it later with an explicit `true`
  (`docs/release/web-config-actions.md`).
- If a republish is required, prepare a hotfix branch from `master`.

## Returning Users to 3.0.x Code

Prefer a forward fix (Hotfix Path below). If users must run 3.0.x code again:

- Use only the 3.0.6 code on `hotfix/3.0.6`. Never republish the published
  3.0.5 package or any 3.0.x build from `master`: they send recovery phrases
  to a remote host on unlock. The store accepts only a higher version, so
  republish that code with a version above the live one.
- What users keep: 4.2.0 encrypts keys with the scrypt parameters 3.0.x reads
  (N = 2^15, `scripts/keystore-scrypt-params.mjs`), so every key and TON phrase
  4.2.0 stored opens in 3.0.6 with the master password set in 4.2.0, and the
  wallets come back once each when 4.2.x returns.
- Rehearse with the exact builds before publishing:
  `node tests/fixtures/upgrade/harness/rollback-306.mjs <3.0.6 build> <current build> <scratch dir>`
  (`tests/fixtures/upgrade/README.md`).

## Hotfix Path

- Create `hotfix/<version-or-slug>` from `master`.
- Apply the smallest safe fix or revert.
- Run typecheck, lint, unit tests, extension build, and Solana e2e smoke for the
  changed surface.
- Open a PR to `master`, tag after merge, then merge or cherry-pick back to
  `develop`.

## After Recovery

- Document root cause, affected versions, user impact, and prevention work.
- Update release notes and the project tracker with the final disposition.
