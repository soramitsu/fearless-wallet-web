# picomatch 2.3.2 with a repeated-extglob guard

This is the MIT-licensed upstream `picomatch@2.3.2` (git tag `2.3.2`, commit
`81cba8d4b767cab3cb29d26eb4f691eed75b73b2`, npm integrity
`sha512-V7+vQEJ06Z+c5tSye8S+nHUfI51xoXIXjHQ99cQtKUkQqqO1kO/KCJUfZXuB47h/YBlDhah2H3hdUGXn8ie0oA==`)
with one local change for
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
(CVE-2026-112366). Upstream has no fixed release as of 18 November 2026: the
advisory covers every version up to the latest, 4.0.7, and the pull request it
cites ([#194](https://github.com/micromatch/picomatch/pull/194), open) changes
how a leading `?` is parsed and says itself that `+(*a)` stays exponential.

## The problem

A `+(...)` or `*(...)` extglob repeats its body. When the body can match the
same text in more than one way, the regular expression nests one unbounded
quantifier in another and backtracks exponentially on a short string that does
not match: `+(*a)` (`(?:[^/]*?a)+`), but also `+(a*(a))`, `+(["]*["])`,
`+(a+)`, `*(+(a)+(a))`, `+({a,aa})`, `+(@(a|aa))` or `+(a?|a)`. Upstream's
`analyzeRepeatedExtglob` catches some multi-branch overlaps and nested `*(...)`
sequences by reading the pattern text, and lets the rest through.

## The change

`lib/parse.js` gains two blocks between `fearless-guard:start` and
`fearless-guard:end` comments: `isPlainRepeatedBody` and one check in
`extglobClose`. When a `+(...)` or `*(...)` extglob closes, the check reads the
regular expression source picomatch has already emitted for the body's tokens,
so it judges exactly what will be compiled. The extglob stays an extglob only
if that source is a plain sequence of literal characters and single-character
classes: bracket expressions, `\d`-style classes, and the `(?:\[ab\]|[ab])`
form picomatch emits for an unflagged bracket, whose two alternatives cannot
match the same text. Any alternation, wildcard (`*`, `?`), quantifier, brace,
group or nested extglob makes it risky, and picomatch then emits the whole
extglob as a literal string, the fallback upstream already uses for its own
risky forms. Upstream's flat rewrite of nested `*(x)` sequences (`+(*(a))` to
`a*`) stays. `maxExtglobRecursion: false` switches the check off together with
upstream's; a numeric `maxExtglobRecursion` does not relax it.

A body of fixed-width literals and classes matches each string in one way, so
the whole class of nested quantifiers in repeated extglobs is closed, not only
the `*` shapes the advisory names. The cost is that a repeated extglob with an
alternation or a wildcard, such as `+(a|b)`, `*(*.js|*.ts)` or `*.+(js|ts)`,
matches only its own literal text. Of upstream's 9,456 assertions at this tag
(1,972 tests), 306 change, each about such an extglob: 128 with an alternation,
144 with a nested extglob, 22 with both, 4 with both and a `?`, 4 with a `*`,
one with an alternation and a `*`, and 3 others (`*((foo))` and upstream's
numeric `maxExtglobRecursion` opt-in). Plain repeated extglobs such as
`+(ab)`, `+([0-9])` and `*([a-z]).txt`, `@(...)`, `?(...)` and `!(...)`, and
every pattern without a repeated extglob behave as before.

## Coverage

Every `picomatch` package installed here resolves to this copy or its sibling.
Some packages bundle their own picomatch inside their files, where no
resolution reaches: rollup 4.62.2 (`dist/shared/index.js`, `dist/shared/rollup.js`, `dist/es/shared/node-entry.js`,
`dist/es/shared/watch.js`; a recent copy with upstream's repeated-extglob safeguard) and prettier 3.8.4
(`index.mjs`; an older copy without it). They run only at build or development time,
on this repository's own patterns, none of which is an extglob.

## Provenance

Every file except `package.json` and this README is the upstream file. With the
blocks between the guard comments removed, `lib/parse.js` is upstream's too.
`scripts/test-development-dependency-guards.mjs` checks these SHA-256 digests of the upstream files and that every
installed `picomatch` package is a vendored copy, runs
`scripts/picomatch-extglob-sweep.cjs` (35 named ReDoS shapes and every repeated
extglob built from one or two of 28 atoms, each compiled and matched against
crafted strings within a CPU budget), and checks ordinary matching.

| File | Upstream SHA-256 |
| --- | --- |
| `index.js` | `5695ff5dfcd5a338a40630bd506056f2950bcb08fe1cc068519cbbfe60add480` |
| `lib/constants.js` | `980225ab847a88a784f6d315557b8434f7742b2551ce20e354455c61b938c0a5` |
| `lib/parse.js` | `3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f` |
| `lib/picomatch.js` | `2cb169cbe17d356036c5f62a377318b85e30817877e59797842aec9d8b15f54b` |
| `lib/scan.js` | `227fcc994a477ea95c5a0435d32783566334c6bd0dcc4a103029735ad8c9c535` |
| `lib/utils.js` | `809fc29cf35ab0aa76b99cad29182f62c0ae598902481d10f9868eaef71981ee` |
| `LICENSE` | `d0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9` |

The package keeps upstream's attribution, license and version, is private, and
is selected by the `picomatch` resolutions in `package.json` for the ranges
`^2.0.4`, `^2.2.1` and `^2.3.1`, which serve micromatch, anymatch, readdirp and `@rollup/pluginutils`.
It is build tooling: the production Chrome and Firefox
bundles contain no picomatch code. See `docs/dependency-audit-exceptions.md`. Remove this copy and those
resolutions when upstream publishes a fixed release.
