# Browser platform ownership

This repository owns the browser extension, its TypeScript protocol implementations, its remote configuration, and the public website under `site/`. Changes to the extension and the modules it uses are reviewed together. The existing SORA dependency-removal audit prevents reintroducing the retired shared SDK packages.

`remote-config/production` and `remote-config/development` contain independently maintained chain catalogs, features, fiat data, onboarding assets, and scam lists. All nested legacy host URLs are rehosted in this repository; `config/remote-config-imports.json` records source commits, import hashes, case normalization, and explicit fixes for unavailable artwork. Run `python3 scripts/test-remote-config.py` and `python3 scripts/verify-remote-config.py` to verify the data and exact filename case before publishing.

`site/` has its own package manifest and lockfile; run its commands from that directory. Both projects use the same Yarn version so nested configuration is compatible. `.github/workflows/site.yml` verifies website dependencies, app association contracts, types, and production build independently of the extension CI.

After this migration is merged, reconnect the existing website hosting project to this repository with production branch `master` and root directory `site`. Verify the live app association endpoints before retiring the previous website repository. Legacy remote-config URLs remain hosted for older installed applications until those consumers can be retired.

The other active Fearless source repositories are `soramitsu/fearless-iOS` and `soramitsu/fearless-Android`. Their native modules and runtime data are owned and tested within those respective repositories. Import provenance is historical evidence, not a dependency on those retired source repositories.

`tools/release-readiness/` owns the backup challenge and owner-authority service sources, their lockfiles, and the retained release tooling. The passkey-services workflow tests both implementations and their contracts. Service publication, production configuration and deployment attestations still require their explicit release gates; source consolidation does not deploy or enable a service. Historical multi-repository audit workflows are kept inside that directory for evidence compatibility and are not active workflows in this repository.
