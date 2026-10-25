# Release Checklist

Use this checklist for every website release PR from `develop` to `master`.

## Before The Release PR

- Confirm all release work has landed on `develop`.
- Confirm public content, supported-network copy, changelog, and release notes
  are final.
- Confirm no private analytics tokens, deployment credentials, or local
  environment files are committed.
- Run `bash ./scripts/test-branch-flow-audit.sh && bash ./scripts/audit-branch-flow.sh`
  and confirm the release branch flow rules still pass.
- Run `./scripts/audit-public-artifacts.sh` and confirm it passes.
- Run `bash ./scripts/test-todo-debt-audit.sh && bash ./scripts/audit-todo-debt.sh`
  and confirm no new TODO/FIXME/STOPSHIP debt was introduced.
- Run `yarn audit:dependencies && yarn audit:dependencies:production` and confirm
  there are no full-tree or production dependency audit findings at low severity
  or above. Preserve the reviewed resolution contract documented in
  `docs/dependency-security.md`.
- Run `yarn verify:release-content` and confirm supported-network and release
  content checks pass.
- Run `yarn test:app-associations && yarn verify:app-associations` and confirm
  the Android and Apple association schemas, identities, response limits, and
  mocked live-response adversarial cases pass.
- Run `yarn typecheck` and confirm Nuxt type generation and TypeScript checks
  pass.
- Confirm the hosting provider production branch is `master` and that `develop`
  or PR preview deployments cannot update the production domain.
- Run or confirm green CI for branch-flow audit, public artifact audit,
  TODO-debt audit, full and production dependency audits, install, release-content
  verification, typecheck, and build.
- Confirm deployment target, rollback owner, monitoring owner, and release
  communication channel.

## Release PR To `master`

- Open the PR from `develop` or `release/<version>` to `master`.
- Include build evidence, deployment notes, release notes, and rollback notes.
- Include the production hosting-provider branch filter evidence.
- Require review and green CI before merge.
- Merge with a merge commit so the release boundary is visible.
- Create the release tag only after the merge commit is on `master`.

## After Release

- Verify the deployed site is serving the tagged commit.
- Run `yarn verify:app-associations:live` and require all three deployed
  association endpoints to exactly match the checked-in release contract with
  HTTP 200, JSON content type, and `X-Content-Type-Options: nosniff`.
- Smoke critical pages, download links, wallet links, and supported-network copy.
- Keep the hotfix path ready from `master` until monitoring is clear.
