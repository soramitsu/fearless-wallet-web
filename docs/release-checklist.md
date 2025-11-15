# Release Readiness Checklist

Updated as of 2024-10-07. This checklist captures what the team runs through
before shipping a new web wallet build to the Chrome Web Store, Firefox Add-ons,
and our internal QA environment.

## 1. Preparation

- [ ] Confirm the target commit is merged to the release branch (`develop` for
      beta, `master` for production) and tagged.
- [ ] Run `node scripts/release/validate-env.js` (Jenkins runs it automatically)
      to ensure signing/upload credentials are present before the build starts.
- [ ] Update `package.json` `version` and changelog notes; push the tag so the
      CI pipeline bundles the correct artifacts.
- [ ] Verify environment secrets (Google OAuth, Mozilla API tokens, Nexus
      credentials) are present in Jenkins (`Jenkinsfile` references `buildWithCred`).
- [ ] Confirm `CRX_UPDATE_URL` is configured when a custom Chrome update feed is
      required; `src/extension/makeManifest.js` injects it into the manifest along
      with a branch-aware `version_name`.
- [ ] Run `yarn format:check`, `yarn lint:ci`, `yarn test:unit`, and `yarn build:extension:all`
      locally; stash the artifacts if you want a quick manual smoke test.

## 2. Jenkins Pipeline

- [ ] Trigger the pipeline job and monitor the stages:
  - `preBuildCmds` installs dependencies inside the build container and must
    succeed before artifacts are created.
  - `build:extension:all` produces Chrome/Firefox zips and uploads them to the
    Nexus path defined in `Jenkinsfile`.
  - SonarQube scan runs via `sonarProjectKey=fearless:fearless-wallet-web`; flag
    new blockers before proceeding.
  - QA downstream job `/qa/soramitsu-test-framework/fearless-wallet-web` kicks
    off the smoke suite — monitor the Slack channel referenced by
    `nexusChatID` for status.
- [ ] After Jenkins finishes, download the zipped artifacts for manual review
      (Chrome, Chrome test build, Firefox) from Nexus if required by QA.

## 3. Store Submissions

- **Chrome Web Store**
  - [ ] Use the `fearless-wallet-extension-chrome.zip` produced by Jenkins.
  - [ ] Submit through the partner console; provide release notes matching the
        changelog. The previously uploaded public key from `EXTENSION_PUBLIC_KEY`
        ensures the package updates the existing listing.
- **Firefox Add-ons**
  - [ ] Use `fearless-wallet-extension-firefox.zip`.
  - [ ] Mozilla API credentials configured in Jenkins can automate submission;
        if manual review is required, ensure the version number matches the Chrome
        listing.

## 4. Post-Release

- [ ] Update the release notes in the repository (`docs/releases/` if present)
      and notify the community channel.
- [ ] Tag the commit and close any Milestone issues related to the release.
- [ ] Schedule the follow-up retrospective and capture action items in
      `docs/planning/`.

## 5. Changelog Automation

- The `.github/workflows/release-drafter.yml` workflow keeps a draft release
  (and changelog entry) up-to-date whenever `master` changes. Review and publish
  it as part of every release.
- Group PRs with labels such as `feature`, `fix`, `perf`, `docs`, or `tests`
  so the Release Drafter config can categorize notes correctly.

## 6. QA Smoke Checklist Reference

Refer to `docs/testing/staking-smoke-checklist.md` for the current smoke suite.
Report results back into the release ticket before marking the deployment as
done.

This doc lives alongside the roadmap item “Establish a release checklist…” and
should be updated whenever the pipeline or submission portal requirements
change.
