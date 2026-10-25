# Dependency audit policy

Both the full and production dependency audits run without advisory ignores:

```sh
yarn audit:dependencies
yarn audit:dependencies:production
```

## Retired `image-size` exception

The former development-only exceptions for npm advisory IDs `1138808`
(`GHSA-w3rx-r6r6-pgpr`) and `1138809` (`GHSA-5p2g-fcmc-qvqq`) have been
removed. The release resolves `image-size` to patched version `2.0.4`, including
the `addons-linter` dependency used by `web-ext`. The Firefox lint wrapper still
strips environment overrides, disables config discovery, bounds output, and
terminates lint after 120 seconds.

## `zod` resolved to 4.6.6

`@ton/ton` (16.3.0, the latest release, and the 15.x that `@subwallet/keyring`
brings) depends on `zod` `^3.21.4`. The advisory
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
(memory exhaustion while validating oversized arrays) covers every `zod` before
4.6.6 and has no fix for 3.x, so the audits failed on a clean install. The release
resolves `zod` to the patched 4.6.6. `@ton/ton` uses `zod` only in its HTTP
clients (`TonClient4` and `HttpApi`), which the wallet does not use; it derives TON
wallet contracts and addresses, so its own code imports the contract module
directly (`@ton/ton/dist/wallets/WalletContractV4`) and no longer loads
`@ton/ton` 16's clients. `zod` 4 still reaches the bundle through
`@subwallet/keyring`'s own `@ton/ton` 15; there its `Function("")` capability
probe, wrapped in try/catch, is the one new Firefox lint finding recorded in
`config/firefox-webext-warning-baseline.json`. The package still loads and derives
wallets with 4.6.6, the TON specs pass, and the extension builds and runs in
Chrome. Reassess when `@ton/ton` and `@subwallet/keyring` publish releases that
depend on `zod` 4, and remove the resolution then.

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
