# minimatch 11 with a fail-closed `makeRe`

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
(denial of service through glob-part amplification) covers every `minimatch`
before 11.0.1, with no fixed 3.x, 9.x or 10.x release as of 1 November 2026.
The development toolchain (ESLint 9 and 10 and their config packages,
`eslint-plugin-import-x`, `editorconfig`, `glob`, `multimatch`) resolves
`minimatch` to this wrapper, which re-exports the published `minimatch` 11.0.3.

minimatch 11 removed `makeRe`, and `eslint-plugin-import-x` 4.17.1 (the latest
release) still imports it for its `no-internal-modules` rule, so the plugin
would not load. This project does not enable that rule. The wrapper keeps the
export so the plugin loads; calling it throws instead of matching with an older,
vulnerable implementation.

Remove the wrapper once `eslint-plugin-import-x` supports minimatch 11.
