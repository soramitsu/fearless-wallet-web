# Dependency audit policy

Both the full and production dependency audits run without advisory ignores:

```sh
yarn audit:dependencies
yarn audit:dependencies:production
```

## Retired `image-size` exception

The former development-only exceptions for npm advisory IDs `1138808`
(`GHSA-w3rx-r6r6-pgpr`) and `1138809` (`GHSA-5p2g-fcmc-qvqq`) have been
removed. The release resolves `image-size` to patched version `2.0.3`, including
the `addons-linter` dependency used by `web-ext`. The Firefox lint wrapper still
strips environment overrides, disables config discovery, bounds output, and
terminates lint after 120 seconds.

## Unpatched development dependencies

Two development dependencies have no published fix at the time of this release.
They are replaced with reviewed local code rather than ignored by the audit:

- `braces` uses upstream 3.0.3 with a fixed parsing-depth ceiling and an iterative
  validation pass before all recursive AST walkers. Excessive nesting, cyclic
  ASTs, and excessive AST size fail before traversal. See `vendor/braces` and
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge` is replaced by a fail-closed shim for the unused Android ADB
  authentication path in the desktop `web-ext` toolchain. It cannot parse RSA
  keys or verify signatures. Android ADB extension testing is unavailable;
  desktop Firefox tooling remains supported. Wallet cryptography and Node TLS
  do not use this shim. See `vendor/node-forge` and
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

`scripts/test-development-dependency-guards.mjs` verifies installed code matches
the reviewed vendor sources, normal glob behavior, adversarial nesting and ASTs,
and fail-closed behavior through the actual ADB parser. The full audit runs this
check first. Reassess these replacements when patched upstream versions become
available; do not restore the affected implementations to silence compatibility
errors.
