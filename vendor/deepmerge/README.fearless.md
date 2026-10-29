# Local deepmerge prototype guard

This is the MIT-licensed `deepmerge@4.3.1` npm distribution with a local fix for
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
The original version and license are retained; this private package does not
claim to be an upstream patched release. No patched npm release was available
when checked on 29 October 2026.

`upstream-provenance.json` records the exact npm tarball integrity, SHA256 and
original file hashes. The small fix follows the reviewed but **unmerged**
[upstream proposal #274](https://github.com/TehShrike/deepmerge/pull/274/files):
reject `__proto__` before reading or assigning that key in both the target-copy
and source-copy loops. It is applied to the source and both distributed builds:
`index.js`, `dist/cjs.js` and `dist/umd.js`. Other merge behavior is unchanged.
In particular, ordinary `constructor`/`prototype` data, null placeholders,
custom array merging and symbol properties retain their original behavior.
The issue affects the returned object's prototype; checking only that global
`Object.prototype` remains unchanged does not detect it.

The `deepmerge: file:./vendor/deepmerge` resolution covers both TonConnect UI's
runtime import and addons-linter's development import. Registry audits cannot
inspect a local package's implementation. Therefore both dependency audit
commands must first run `node scripts/test-deepmerge-guard.mjs`, which checks
that every installed executable entrypoint matches this reviewed copy, verifies
both consumers resolve it, rejects npm deepmerge resolutions in the lockfile,
and exercises the actual installed implementations against the attacks and
normal compatibility cases. Advisory severity and exclusions remain unchanged.

The guard executes `index.js` in an isolated VM using the unchanged mergeable
object predicate exposed by the distributed build, because upstream's source
requires its build-only `is-mergeable-object` dependency, which is not included
in the published runtime dependencies. The distributed entrypoints are executed
directly as installed. Upstream build scripts/devDependencies were removed from
this private runtime package; no runtime dependency was added.

Remove this local package after an upstream fix has been reviewed and passes
the same regression tests. Do not replace the guarded implementation with an
older unpatched version or an audit exclusion.
