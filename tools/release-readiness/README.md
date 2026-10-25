# Fearless platform release tools and backup services

This directory belongs to `soramitsu/fearless-wallet-web`. It preserves the release-readiness tools and the two passkey backup service implementations formerly maintained in a separate repository. Application builds are owned independently by the iOS, Android and browser repositories.

The services live in `services/passkey-backup-challenge-service` and `services/passkey-backup-owner-authority`. Run `npm ci --ignore-scripts`, `npm run lint:syntax` and `npm test` in each service directory. The browser repository runs these checks in its passkey-services workflow. The owner authority remains a non-deployed reference composition; importing its source does not enable recovery or publish a service.

The workspace manifest contains the four retained public repositories: iOS, Android, browser extension, and website. From this directory, `node scripts/setup-workspace.mjs --root /path/to/workspace` creates missing checkouts at recorded revisions; `--check` verifies without changes. Existing work is never overwritten. Each application builds with sources in its own checkout; no shared-library environment variables are needed.

Cross-platform vector checks can be run with `node scripts/verify-universal-wallet-vectors.mjs /path/to/workspace`.

The broader historical release-audit scripts, plan, and nested `.github` workflow contracts are retained for migration and evidence compatibility. They describe the earlier multi-repository deployment process and are not active GitHub workflows at this nested location. Use the platform repositories' current CI gates for source integration. Deployment/publication migration remains separate from these source checks; do not treat an old readiness result as approval of a new platform revision. The previous setup instructions are preserved in `docs/pre-consolidation-readme.md`.
