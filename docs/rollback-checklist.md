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
  without republishing.
- If a republish is required, prepare a hotfix branch from `master`.

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
