# Dependency audit policy

Both the full and production dependency audits run without advisory ignores:

```sh
yarn audit:dependencies
yarn audit:dependencies:production
```

Advisories are fixed with patched versions: a direct dependency moves to a
patched release, and a transitive one is pinned to it in `resolutions`.

## Retired `image-size` exception

The former development-only exceptions for npm advisory IDs `1138808`
(`GHSA-w3rx-r6r6-pgpr`) and `1138809` (`GHSA-5p2g-fcmc-qvqq`) have been
removed. The release resolves `image-size` to patched version `2.0.3`, including
the `addons-linter` dependency used by `web-ext`. The Firefox lint wrapper still
strips environment overrides, disables config discovery, bounds output, and
terminates lint after 120 seconds.

## `zod` resolved to 4.6.6

`@ton/ton` (16.3.0, the latest release, and the 15.x that `@subwallet/keyring`
brings) depends on `zod` `^3.21.4`. The advisory
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
(memory exhaustion while validating oversized arrays) covers every `zod` before
4.6.6 and has no fix for 3.x, so both audits failed on a clean install. The
release resolves `zod` to the patched 4.6.6. `@ton/ton` uses `zod` only in its
HTTP clients (`TonClient4` and `HttpApi`), which the wallet does not use: it
derives TON wallet contracts and addresses, so its own code imports the contract
module directly (`@ton/ton/dist/wallets/WalletContractV4`) and no longer loads
`@ton/ton` 16's clients. The package still loads and derives wallets with 4.6.6,
and the TON specs pass. Reassess when `@ton/ton` and
`@subwallet/keyring` publish releases that depend on `zod` 4, and remove the
resolution then.
