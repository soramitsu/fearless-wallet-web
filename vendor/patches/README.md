# TON SDK Zod compatibility patch

`ton-16.3.0-zod-4.patch` applies to the direct registry dependency
`@ton/ton@16.3.0`; `ton-15.4.0-zod-4.patch` applies to the existing
`@subwallet/keyring` transitive dependency `@ton/ton@15.4.0`. Both SDK versions
remain unchanged apart from the reviewed compatibility patches.
The dependency resolution selects Zod 4.6.7 to include the fix for
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

The SDK's one-argument operation-options record becomes an explicit
string-keyed, string-valued record, preserving its Zod 3 behavior with Zod 4.
Its generated declarations continue to use the Zod 3 declaration namespace via
**type-only** imports from `zod/v3`; executable SDK imports use the patched Zod 4
entry point. No Zod 3 runtime is introduced by these declaration imports.
Both SDK parser modules set Zod's `jitless` configuration before constructing
any schema, so extension CSP does not encounter dynamic compilation attempts.

`tests/unit/ton-zod-compatibility.spec.ts` covers both actual TON SDK versions and client response
parsing, operation options, rejection of malformed responses, parsing under a
dynamic-code restriction, and the fixed early collection-size guard. Yarn
records the patch hash and registry checksums in `yarn.lock`; installation and
reviewer builds apply the patch automatically.

The Firefox linter finds two additional Zod capability probes in the current
and legacy TON bundles. Both return before calling `Function` when `jitless`
is enabled. The wallet does not reset that flag or invoke Zod's explicit
compiler APIs; the extension CSP also blocks dynamic JavaScript. The reviewed
warning baseline pins these two guarded probes and the 41 unchanged dependency
warnings to their exact locations and bundle hashes.
