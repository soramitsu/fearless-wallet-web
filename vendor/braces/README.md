# Bounded development-tool brace parser

This is the MIT-licensed upstream `braces@3.0.3` source with a local depth guard
for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Upstream has no published patched version as of 22 October 2026.

The parser rejects nested braces/parentheses at depth 128. Before compile,
expand, or stringify can recurse, an iterative guard checks depth, node count,
child cycles/shared nodes, and parent-chain cycles. Direct AST and `lib/` callers
receive the same protection. Normal brace/range semantics remain upstream.

The package retains upstream attribution, license and version, is private,
and is selected through exact local-file resolutions. It is development
infrastructure, not wallet signing code. Remove this local copy when upstream
ships a tested fix. `scripts/test-development-dependency-guards.mjs` checks the
installed copy, hostile nesting and normal micromatch/glob behavior.
