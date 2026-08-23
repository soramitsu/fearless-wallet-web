# Contributing to Fearless Wallet Web

## Git Flow

All normal work starts from `develop` and is submitted back to `develop`.
Use short-lived branches named `feature/<ticket>-<slug>`, `fix/<ticket>-<slug>`,
`chore/<slug>`, or `refactor/<slug>`.

`master` is the releasable branch. Do not target `master` except for release
pull requests from `develop` or urgent `hotfix/<version-or-slug>` branches.
Every commit on `master` must be safe to release, and release tags must point at
commits already merged to `master`.

Feature PRs are squash-merged after review and green CI. Release PRs to
`master` use merge commits so the release boundary remains visible.

The `Branch Flow` GitHub Actions workflow validates PR targets automatically:
normal work must target `develop`, while `master` accepts only `develop`,
`release/*`, or `hotfix/*` branches.

## Local Checks

Run these before submitting a PR:

```sh
yarn install --immutable
yarn typecheck
yarn lint:check
yarn test:unit
yarn build:web
yarn build:extension
yarn test:e2e:solana
yarn build:extension:firefox
yarn lint:webext:firefox
yarn test:e2e:firefox
```

The `lint` script rewrites files with `--fix`. Use `lint:check` when you need a
read-only gate.

Firefox lint warnings are fail-closed through
`config/firefox-webext-warning-baseline.json`. The baseline binds the exact
warning fingerprints, warning-bearing bundle files, their SHA-256 digests, and
the installed `web-ext` version. Never update it just to make CI green: inspect
every changed finding first, prefer eliminating it, then regenerate the review
candidate with `node scripts/audit-firefox-webext-warnings.mjs --print-baseline`.
CI must use `yarn lint:webext:firefox`; the raw command is diagnostic only and
intentionally fails while reviewed warnings remain.

The production Firefox build also fails on any unreviewed Vite/Rolldown
warning. Reviewed dependency annotation and chunk-size diagnostics remain
visible in the build log and are matched to exact build targets and source
locations. The IIFE builds normalize only the known Polkadot `packageInfo`
metadata path to its documented `auto` fallback; any other `import.meta` use
fails the build. The browser `vm` alias is an explicit throwing shim for
`asn1.js`, whose equivalent browser fallback is covered by a unit test.

`yarn test:e2e:firefox` launches the production extension in a fresh headless
Firefox profile and kills the complete owned process group afterward. It fails
on bounded RDP timeouts or protocol errors, an unmounted/noninteractive popup,
Firefox JavaScript startup errors, or an extension CSP that permits dynamic
`Function` execution. Set `FIREFOX_BINARY` when Firefox is installed in a
nonstandard location. CI pins the repeatedly verified Firefox `152.0.4`
runtime, passes its executable path through one contiguous setup/smoke block,
and fails before launch unless that exact executable reports `Mozilla Firefox
152.0.4`; GitHub Actions cannot fall back to a system Firefox. Mutable channels such as `latest`,
`beta`, `nightly`, and `esr` are rejected by the smoke-policy test. Upgrade the
pin, its policy constant, and this documentation together only after the full
`yarn test:e2e:firefox` gate passes on the candidate version.

## Pull Requests

- Target `develop` for normal work.
- Target `master` only for release or hotfix PRs.
- Include the issue or task link.
- Include screenshots or recordings for visible UI changes.
- Include dApp permission/signing test notes for provider changes.
- Document migration, environment, extension-store, or rollback considerations.
- Do not commit secrets, local environment files, generated build output, or
  private distribution overlays.
