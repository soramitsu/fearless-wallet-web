# App association contract

The files under `src/public/.well-known/` are release credentials, not generic
marketing content. Their identifiers are grounded in the mobile release
configuration checked out beside this repository:

- Android release package: `jp.co.soramitsu.fearless`, from
  `fearless-Android/app/build.gradle`. The SHA-256 certificate fingerprint is
  the existing public release association fingerprint; no keystore or private
  signing material is stored in this repository.
- Apple team: `YLWWUD25VZ`, from
  `fearless-iOS/fearless.xcodeproj/project.pbxproj`.
- iOS release bundle: `jp.co.soramitsu.fearlesswallet`, from the Release target in
  that Xcode project.
- iOS development bundle: `jp.co.soramitsu.fearlesswallet.dev`, from the Dev
  target in that Xcode project.

`scripts/verify-app-associations.mjs` enforces the exact package, certificate,
team, bundle IDs, Android URL/credential relations, Apple applinks, and Apple
webcredentials. The Android certificate fingerprint was retained from the
pre-existing public association file; this change does not derive, guess, or
publish any signing key material. The verifier rejects unknown fields,
symlinked or oversized source files, redirects, non-200 responses, oversized
live bodies, non-JSON responses, and missing `X-Content-Type-Options: nosniff`.
Live JSON must be structurally identical to the checked-in source contract, so
a merely plausible but stale deployment cannot pass:

```sh
yarn verify:app-associations:live
```

The scheduled live-gate workflow runs that comparison against
`https://fearlesswallet.io`. A source-only pass is not deployment evidence; the
release remains blocked while the live comparison fails.
