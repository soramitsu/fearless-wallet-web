# Dependency audit policy

For the production WASM inventory and binary-to-source evidence (a separate check from advisory scanning), see [Chrome WASM provenance](release/wasm-provenance.md).

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

## Development tooling on patched majors (1 November 2026)

New advisories failed both audits for every branch: `follow-redirects` 1.16.1
under `axios` ([GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)),
`glob` 13 under `js-beautify` ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4))
and every `minimatch` before 11.0.1 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
The release resolves `follow-redirects` to 1.16.2, `glob` to 14.0.3, `multimatch`
(under `web-ext`) to 7.0.0, which imports `minimatch` by name, and `minimatch` to
`vendor/minimatch`: the published 11.0.3 with the `makeRe` export that 11 removed
kept as a stub that throws, so `eslint-plugin-import-x` 4.17.1 still loads. The
project does not enable that plugin's `no-internal-modules` rule, the only user of
`makeRe`. `scripts/test-development-dependency-guards.mjs` checks the installed
wrapper against `vendor/minimatch`, its upstream version, matching through both
entries, the refusing `makeRe`, `multimatch` and the plugin. Remove the wrapper
when `eslint-plugin-import-x` supports minimatch 11.

## Unpatched development dependencies

Three development dependencies have no published fix at the time of this release.
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
- `picomatch` uses upstream 2.3.2 and 4.0.7 with one added check each
  (18 November 2026). A repeated extglob (`+(...)`, `*(...)`) whose body can
  match the same text in more than one way, such as `+(*a)`, `+(a+)`,
  `+({a,aa})` or `+(@(a|aa))`, compiled to nested quantifiers that backtrack
  exponentially on a short string. When such an extglob closes, the check reads
  the regular expression picomatch emitted for its body and keeps it only if it
  is a plain sequence of literal characters and single-character classes;
  anything else is emitted as a literal string, as upstream already does for its
  own risky forms. The cost: a repeated extglob with an alternation or a
  wildcard (`+(a|b)`, `*.+(js|ts)`) matches only its literal text. No
  configuration here uses an extglob. Every `picomatch` package resolves to
  these copies, including the 4.0.4 that some tools used. Two packages bundle
  their own picomatch inside their files, where no resolution reaches: rollup
  4.62.2 (`dist/shared/*.js`, `dist/es/shared/{node-entry,watch}.js`) and
  prettier 3.8.4 (`index.mjs`). They run only at build or development time, on
  this repository's own patterns. (`@vue/compiler-sfc` bundles minimatch, not
  picomatch.) The advisory covers every release up to the latest and the pull
  request it cites does not fix it. See `vendor/picomatch-2`,
  `vendor/picomatch-4` and
  [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

`scripts/test-development-dependency-guards.mjs` verifies installed code matches
the reviewed vendor sources, normal glob behavior, adversarial nesting and ASTs,
and fail-closed behavior through the actual ADB parser. For `picomatch` it also
checks each vendored file against upstream's digest, that every installed
`picomatch` package is a vendored copy, 116 ordinary matches and the 9
alternation cases that now match literally, and runs
`scripts/picomatch-extglob-sweep.cjs`: 35 named ReDoS shapes and every repeated
extglob built from one or two of 28 atoms must compile and answer crafted
strings within a CPU budget. The full audit runs this check first. Reassess these
replacements when patched upstream versions become available; do not restore
the affected implementations to silence compatibility errors.

Yarn's registry audit skips `file:` packages, so it would never report a new
advisory against the vendored braces or picomatch code. After it, both audits
run `scripts/audit-vendored-dependencies.mjs`, which asks npm's bulk advisory
endpoint about the upstream version each copy carries (braces 3.0.3, picomatch
2.3.2 and 4.0.7) and fails on every advisory except the one that copy is
reviewed to guard against. It first checks that each copy is the listed version
and that its guarded files match the digests in
`config/vendored-dependency-advisories.json`, so the exemption lapses as soon as
a guard changes without review. `yarn test:vendored-dependency-audit` covers it
with fixed registry responses.
