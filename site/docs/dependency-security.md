# Dependency security patches

Reviewed 2026-10-23. Lockfile versions were upgraded against the known advisory inventory; local Yarn patches cover the following packages that have no published fixed version.

| Package | Advisory | Local change | Verification |
| --- | --- | --- | --- |
| `braces@3.0.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Bound parser nesting and all three public recursive AST walkers to 128 levels. Excess nesting raises `SyntaxError` before exhausting the stack. | Deep braces/parentheses and caller-supplied ASTs are rejected; ordinary alternatives/ranges still expand. |
| `node-forge@1.4.0` | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Require the nested DigestAlgorithm sequence to contain exactly its captured OID and optional NULL. | Valid RSA signatures with and without NULL parameters pass; extra nested elements and wrong digests fail. |

The Forge change is equivalent to the source fix proposed in [upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152), which was still open at review time. The local patch is maintained by this repository; it is not an upstream release. Both patch files are tracked under `.yarn/patches`, selected in `package.json`, and covered by Yarn lock checksums.

Run `yarn test:dependency-security` after a clean immutable install; CI runs it before dependency audits. Preserve these regression tests when replacing a patch with a released fix. Yarn audit can omit patched locators, so the workspace's `scripts/scan-locked-dependencies.mjs` also queries their original versions and reports `patched-source-review` entries. Base-version advisory matches must be paired with the exact patch and passing regressions, not silently ignored.

Nuxt is upgraded to 4.6.2 with Vite 8.3.5. The OSV entry for GHSA-vjh5-4x84-xrqp erroneously reports this fixed release through an unbounded Nuxt 3 range; its Nuxt 4 range explicitly ends at 4.6.2. The [maintainer advisory](https://github.com/nuxt/nuxt/security/advisories/GHSA-vjh5-4x84-xrqp) confirms that version is patched and bounds the Nuxt 3 range below 4.0.0. Retain the raw scan record and validate the affected range rather than suppressing future Nuxt advisories.

The audit wrapper permits only the two base-version npm alerts above, and only after verifying exact patch SHA-256, manifest selection, lockfile selection, and passing the runtime regressions. Any changed patch/selection, failed probe, service failure, or other advisory fails the gate. Raw OSV results remain available for independent review.

Consolidation follow-up (2026-10-25): removed the unused direct Zod 3 dependency and pinned serialize-javascript 7.1.3, the upstream fix for [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v). The unused Zod dependency was affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The complete dependency audit is rerun after installation; the two existing byte-verified patch exceptions are unchanged.
