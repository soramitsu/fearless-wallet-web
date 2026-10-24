# Extension integration review — 24 October 2026

Target: `develop`. User-directed scope: the latest store-release line, safe-upgrade integration, all remaining local extension branches and unique uncommitted source work. Version: `4.2.0`, retaining the safe-upgrade release version above the 3.0.x store line.

## Preservation and review decisions

- Merge history retains every local branch tip in the inventory below. Conflicts were resolved by reconciling behavior rather than choosing an entire branch wholesale.
- The original source checkouts remain untouched. Binary diffs and untracked source copies for the primary checkout and the older audit checkout are saved in the parent workspace at `output/browser-integration-preserved-20261024/`. This also contains the reminder and XCM snapshots. These are recovery copies, not release inputs.
- Safe-upgrade storage transactions, legacy account access, fresh-wallet provenance, exposure guidance, design/accessibility work and portfolio policy remain integrated with the latest release transfer guards.
- Both genuine release TON fixtures and the E5 generator-backed corpus are retained. E5 version-2 scrypt and version-3 archive compatibility is integrated into the serialized vault; earlier storage drafts remain in branch history and preserved diffs.
- The primary checkout contributed NFT authorization removal, history endpoint/privacy validation, escaped and bounded pricing queries, offline Iroha inventory, support links and dated investigation records. Its old dependency-exception scripts were reviewed and superseded by the stricter vendored shims, advisory audits and development-dependency guards already integrated.
- The older Chrome release-ready Iroha MCP history and temporary dependency profile are superseded by the maintained Torii REST history, reviewed production SDK and live-evidence gates. Their original commits remain ancestors.
- Historical 3.0.6 private-build-path audit protection was ported into the current release artifact audit. The older dependency versions were not restored over the newer patched versions.
- New Send input/reconnection work retains live EVM chain verification: configured chain metadata must not replace a node check. A real-provider wrong-chain regression covers this boundary.
- Zero-balance search is reconciled with the newer portfolio: total versus transferable balances, verified-only fiat totals, explicit testnet visibility, wallet scope and duplicate-row handling are preserved.
- Capability cache expiry and periodic refresh coexist with compiled release permissions and remembered remote vetoes. A fresh remote `true` cannot enable a capability disabled by the build.
- The older Firefox warning baseline in the dashboard worktree is build-output-specific; its original remains in place. The final combined Firefox artifact must be reviewed against its own lint output before updating a baseline.

## Integrated branch tips

Inventory cutoff: 24 October 2026, approximately 22:00 JST. Later edits in other chats are outside this snapshot until explicitly incorporated.

| Branch | Commit | In integration history |
| --- | --- | --- |
| `codex/browser-bugfixes` | `8e816397d9542bf095fd9017745d22f4fc9283d7` | yes |
| `codex/chrome-3.0.6-audit-release` | `a7c1f172c3fd99d8b26d5c0f317666af5e1b9978` | yes |
| `codex/chrome-3.0.6-release` | `5001b466f14265f536bef694a1e45471c68f9e22` | yes |
| `codex/chrome-3.0.6-release-ready` | `f9e6ec555e7ec0ec31ddf7b1d5ad770ae91c9323` | yes |
| `codex/chrome-3.0.9-send-release` | `098e69560456dbaadd27a621f022b70d6f8f8878` | yes |
| `codex/firefox-store-3.0.9` | `db314d2ef1d0d700dfdb2101c4322884370e6bb0` | yes |
| `codex/verified-crx-uploads` | `caf9107d49649d2284a1f413cb1d1ec72b20792c` | yes |
| `codex/web-bitcoin-broadcast-evidence` | `315f2af5b2fb12fd5816404538827bc2d58b1719` | yes |
| `codex/web-bitcoin-canonical-indexer-evidence` | `ff326cc9260b6baffc505c902d414cc1e019f693` | yes |
| `codex/web-production-consolidated-20260801` | `ff326cc9260b6baffc505c902d414cc1e019f693` | yes |
| `codex/web-screen-accessibility` | `95e83459cf77e3c5a68028e80d22570664bf3daf` | yes |
| `develop` | `5001b466f14265f536bef694a1e45471c68f9e22` | yes |
| `feature/enable-bitcoin-taira-send` | `3ca27faafca69075db9864b6bb11fd3a16acb0be` | yes |
| `feature/portfolio-dashboard-p0` | `002485b375b62c672b181800f711a86d74a80006` | yes |
| `fix/legacy-wallet-recovery` | `0e1561377ab57379f9cd32356061bb19491500d8` | yes |
| `fix/new-wallet-no-legacy-notice` | `8b6b2a9aa561a93ab0dd05f736ecdbdc4dec479b` | yes |
| `fix/search-zero-balance-tokens` | `d91a6ca9c7b6c37fac3945ea59a622b4e1bb5a0a` | yes |
| `fix/send-form-ux` | `2f19d5894281bf4c8f353a74e7e6dd36b4382312` | yes |
| `hotfix/3.0.6` | `f1cb3afcf0ccb9f5f436e519f86328eea3cd6909` | yes |
| `lane/E0-toolchain` | `c6825486a4934862231af285d38246e74f2e4d2c` | yes |
| `lane/E1-cuneiform` | `2b9fa148f7f6e2c51ca5d8ededb4bf1398c011eb` | yes |
| `lane/E1-features` | `5ef347e94d37d17924ac9d860c04367db0a177bf` | yes |
| `lane/E1-gates` | `bdc7018a7d7c5975c7f85a064caef7605cff0c60` | yes |
| `lane/E1-startup` | `5bc1942eb183f7d7fe548d7c051713ad9c5bfa0e` | yes |
| `lane/E1-ton` | `faa50bf4aece68c1d40b39f2ada17b63c0770e2e` | yes |
| `lane/E2-keys` | `aa34334c0dcc5189fe27bfda6ce5854ab525d9e8` | yes |
| `lane/E2-portfolio` | `fcef1dea715f154846516eaa17288c5ee68d06ea` | yes |
| `lane/E3-keys` | `c42abfb3eb39d9cbd5e775c99366c09ca532b024` | yes |
| `lane/E3-notice` | `be4668521b329e8e7ec6fc4434cd47a688a2be71` | yes |
| `lane/E3-portfolio` | `dbf4b8c7b2a7f64b74279a4c906fcbaea9fde6a1` | yes |
| `lane/E3-ton` | `a72ac2e548f12afbd32480b7f7af9bba47b0e7dd` | yes |
| `lane/E4-design` | `8691e07f348acffb4578aebfaa04f30ca375c340` | yes |
| `lane/E4-e2e` | `8d3759e77dad7129324fb9938adafce382724cdc` | yes |
| `lane/E5-ton306` | `718f8a86840282f793ad8e1ee9b65822c55fa7f2` | yes |
| `lane/E6-axios` | `b4492408c2e650bb98cb7c139b39b569c28e3e5d` | yes |
| `lane/E7-exposure-banner` | `c8b72f95bcd0c2b3e935ad122b3b2c1d3d8bd57c` | yes |
| `lane/SOL-cluster` | `0e4355427a68be45d8aaa210b68bd5fe70f64471` | yes |
| `lane/xcm-review` | `204d9ec5038dd63d1a2b5164b9e5144095e27585` | yes |
| `release/3.0.10-solana` | `2d1d26c8b8463029bcff17995eea7edebba4bd1b` | yes |
| `release/3.0.7-recovery` | `76812ad7fe383fcb41d161f84c40256cf230e46d` | yes |
| `release/3.0.9-sends` | `9c222baece6f27d3a3dc9eba9e999b55d708280f` | yes |
| `release/fearless-safe-upgrade` | `c8b72f95bcd0c2b3e935ad122b3b2c1d3d8bd57c` | yes |

## Validation status

Focused regression runs cover the original four bugs and conflicts discovered during integration. Final full-suite, production build, browser smoke and upgrade-matrix results are recorded separately; this inventory is not a claim that the release gates or store submission have completed.

The protected `develop` branch requires independent review and required CI checks. The merge must use that workflow. Store acceptance and availability are separate from source integration.
