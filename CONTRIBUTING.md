# Contributing to Fearless Wallet Web

## Branch workflow

`master` is the only long-lived branch and the default branch. All normal work
starts from `master` and is submitted back to `master` through a reviewed pull
request with green CI. Use short-lived `feature/*`, `fix/*`, `chore/*`,
`refactor/*`, `release/*`, or `hotfix/*` branches and delete them after merging.

`master` is the releasable branch. Release tags must point at commits already
merged to `master`. Use squash merges for ordinary changes to keep the protected
branch's linear history. Preserve historical release commits needed by upgrade
tests and evidence checks; deleting an obsolete branch does not remove them.

The `Branch Flow` GitHub Actions workflow accepts pull requests only to `master`.

## Toolchain

The repository pins Node `24.19.0` (`.nvmrc`, `engines`, CI) and Yarn `4.17.0`
(`packageManager`). `yarn.lock` is the only lockfile: do not install with npm,
pnpm, or bun. `yarn audit:package-manager` fails if another lockfile appears or
the pins drift apart.

On macOS with Homebrew:

```sh
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH" # node@24 is keg-only
corepack enable                                  # Node 24 bundles Corepack
yarn --version                                   # 4.17.0, taken from packageManager
yarn install --immutable                         # must leave yarn.lock unchanged
```

Homebrew's `node@24` follows the newest 24.x patch, which is fine for
development. `yarn prepare:chrome-release` requires exactly Node `24.19.0`, so
use a version manager that reads `.nvmrc` (for example `nvm install && nvm use`)
for release builds. If `corepack` is missing, install the same version CI uses
with `npm install -g corepack@0.34.1`.

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
nonstandard location. CI downloads the repeatedly verified Firefox `152.0.4`
Linux x86-64 en-US archive directly from Mozilla over HTTPS and verifies its
SHA-256 against a repository pin taken from the release's
[official checksums](https://archive.mozilla.org/pub/firefox/releases/152.0.4/SHA256SUMS)
before extraction. This uses the runner's shell tools without a third-party
setup action. CI passes its executable path through one contiguous setup/smoke block,
and fails before launch unless that exact executable reports `Mozilla Firefox
152.0.4`; GitHub Actions cannot fall back to a system Firefox. Mutable channels such as `latest`,
`beta`, `nightly`, and `esr` are rejected by the smoke-policy test.
`scripts/ci-install-firefox.sh` installs that runtime from Mozilla's release
archive (no third-party action) and refuses to extract a tarball unless it
matches both the pinned SHA-256 in the script and Mozilla's release
`SHA256SUMS`; `yarn test:ci-install-firefox` proves a wrong checksum stops
before extraction. Upgrade the pin, its checksum, its policy constant, and this
documentation together only after the full `yarn test:e2e:firefox` gate passes
on the candidate version.

## Pull Requests

- Target `master` for all work using a short-lived branch.
- Include the issue or task link.
- Include screenshots or recordings for visible UI changes.
- Include dApp permission/signing test notes for provider changes.
- Document migration, environment, extension-store, or rollback considerations.
- Do not commit secrets, local environment files, generated build output, or
  private distribution overlays.
