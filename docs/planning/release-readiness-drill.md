# Release Readiness Drill — Plan

Updated: 2024-10-07  
Owner: Kenji Yamamoto

## Goal

Dry-run extension builds/signing, validate manifest/changelog automation, and execute regression packs ahead of store submissions by **2024-12-02 (Sprint 49 kickoff)**.

## Checklist

### 1. Build & Signing Pipeline

- [ ] Trigger `yarn build:extension:all` locally; verify Chrome MV3 + Firefox MV2 bundles.
- [ ] Validate Jenkins pipeline (`Jenkinsfile`) runs with updated preflight script (`scripts/release/validate-env.js`).
- [ ] Ensure required secrets (Chrome/Firefox API keys, signing certs) pass the preflight check.
- [ ] Produce zipped artifacts (`fearless-wallet-extension-chrome.zip`, `fearless-wallet-extension-firefox.zip`) and confirm Nexus upload paths.

### 2. Manifest & Automation

- [ ] Confirm `src/extension/makeManifest.js` injects branch-aware `version_name` and optional `CRX_UPDATE_URL`.
- [ ] Verify Release Drafter workflow (`.github/workflows/release-drafter.yml`) keeps draft notes updated.
- [ ] Update `docs/release-checklist.md` with any workflow findings.

### 3. Regression Testing

- [ ] Run `yarn format:check`, `yarn lint:ci`, `yarn test:unit`, and targeted integration tests (staking/pools/swap smoke).
- [ ] Execute manual smoke per `docs/testing/staking-smoke-checklist.md` and critical extension flows.
- [ ] Capture results in the release ticket; highlight blockers.

### 4. Store Submission Dry Run

- [ ] Chrome Web Store: confirm `EXTENSION_PUBLIC_KEY` maps to existing listing, ensure release notes/changelog match.
- [ ] Firefox Add-ons: validate API credentials + automated submission script (if used).
- [ ] Document any manual steps for QA review (QA zipped artifacts from Nexus).

### 5. Comms & Docs

- [ ] Prepare release notes draft (pull from Release Drafter).
- [ ] Notify stakeholders via Slack/email with readiness status and list of follow-ups.

## Schedule

- **Nov 18–22**: Prep tasks, ensure secrets + pipeline ready.
- **Nov 25–29**: Run dry-run builds/tests, address findings.
- **Dec 02**: Share final readiness report at Sprint 49 kickoff.

## Risks & Mitigation

| Risk                       | Mitigation                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Secrets outdated / missing | Preflight script fails early; coordinate with DevOps to refresh Jenkins credentials. |
| Release Drafter drift      | Manually regenerate draft release; adjust workflow config if labels missing.         |
| QA bandwidth               | Schedule smoke tests ahead of holidays; automate where possible.                     |

## Action Items

1. [ ] Confirm Jenkins credentials + preflight script output by Nov 15. — _2024-10-10 update_: ran `scripts/release/validate-env.js` with `BRANCH_NAME=develop`; missing `EXTENSION_PUBLIC_KEY`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`. Coordinate with DevOps to refresh Jenkins secrets.
2. [ ] Run full dry run (builds + tests) week of Nov 25.
3. [ ] Deliver readiness summary + open issues list on Dec 2.
