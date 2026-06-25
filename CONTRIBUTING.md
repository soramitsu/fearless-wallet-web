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
```

The `lint` script rewrites files with `--fix`. Use `lint:check` when you need a
read-only gate.

## Pull Requests

- Target `develop` for normal work.
- Target `master` only for release or hotfix PRs.
- Include the issue or task link.
- Include screenshots or recordings for visible UI changes.
- Include dApp permission/signing test notes for provider changes.
- Document migration, environment, extension-store, or rollback considerations.
- Do not commit secrets, local environment files, generated build output, or
  private distribution overlays.
