# Neon Glass component verification

## Shared component colour roles, 14 October 2026

Nineteen explicit roles in `src/styles/common.scss` now own the existing legacy/v1 mappings for panels, fills, focus, control edges, selection and chrome. Seventeen Vue components consume those roles, removing 29 private literal occurrences. The exact allowlist only shrinks: 203 occurrences/181 unique sites become 174 occurrences/153 sites. Remaining literals still require migration; passing below the earlier numerical inventory does not complete the screen/design audit.

Before and after compilation uses the existing Vite Sass recipe for all 251 style units, under both legacy and v1 palettes. All 502 CSS outputs are byte-identical, with the complete source/compiled snapshots and comparison saved under `web-semantic-colour-*` in the audit evidence directory. No templates, scripts, callbacks or wallet logic change. Final source67aa17d9 passes30 targeted tests/zero skips, full typecheck, lint for all17 changed Vue files and the actual shrink-only CLI. All1,382 non-documentation source pins remain unchanged. Vue parser comparison confirms exact templates, scripts, custom blocks and style attributes in all17 changed components. The final committed CSS snapshot verifies502 exact outputs and506 Git-bound source pins. docs/release/semantic-colour-validation.json freezes the candidate (SHAae17f50f428e1fd9c6ceb0ebccee2d8f67da6fe5c5c0090515019a232e0acfc8). Independent acceptance is pending; no new browser or packaged-build qualification is claimed.

## Raw colour guard qualification, 14 October 2026

`scripts/check-raw-colours.mjs` scans all Vue template/script/style/comment text outside `src/styles`, including multiline RGB expressions. Exceptions match an exact file and source context, with occurrence counts. New colours, changed values/context, moved sites and duplicate occurrences fail; obsolete exceptions must be removed. CI also compares the allowlist with the pull-request base or push predecessor, so retired entries cannot return and additions cannot be hidden by editing the allowlist. Missing base objects fail unless CI fetches the exact validated commit; the initial adoption explicitly reports that the older commit had no allowlist. The existing unit-test CI includes ten adversarial guard tests.

The reconciled inventory is 203 occurrences across 181 unique sites in 65 of 243 Vue files, including one colour in a comment. The binding plan's earlier count of 179 is not reproduced: the frozen 10 October source has 180 occurrences under this rule, and the accepted 12 October source has 191. `web-raw-colour-inventory-v1.json` in the audit evidence directory retains those Git-bound inventories and differences. The initial guard prevents further growth from the current source; it does not close the older colour-migration debt or permit future expansion. Production source and rendered colours are unchanged.

The initial test run retained a Vite/shebang loading failure and six Node-global lint errors. Explicit Node imports and the Node test environment correct the harness. Final targeted runs pass 30 tests (ten guard plus 20 existing palette/contrast tests), full typecheck and scoped lint. Final source ff88e823 has 1,382 non-documentation source pins unchanged across checks; docs/release/raw-colour-validation.json binds the candidate and preserved failures. Independent review b1f9b24fd11ab008b1c739ba59d4243e363347e1b34191fcd6ad41a819c24ae2 accepts the bounded guard, rehashes all pins and independently repeats all 30 tests. Integrated through c1c78915 with all 1,382 source pins and full non-documentation equality verified. Android/iOS counterparts, raw-colour migration and broader design/release gates remain open.

W-A5 component foundation, 12 October 2026. This is development-build evidence, not a release qualification. Source is the commit containing this document; its parent preserves the independent local-chain test-discovery fix.

## Behavior covered

- Dialogs and sheets have accessible names, initial focus, bounded Tab navigation, guarded Escape dismissal and opener restoration, including cached route reactivation. Headerless blocking acknowledgements retain their dismissal guard.
- Currency selection uses native buttons, exposes selected state and emits dismissal once. Inputs have distinct associated labels and emit changes once. Tabs support arrow/Home/End navigation. Switches and checkboxes retain native disabled behavior and readable state glyphs.
- Components use the approved shared tokens, readable opaque modal surfaces, control edges and cyan focus. Calm/Reduced surfaces suppress decorative shadows. QR images use a dark module color and fit their container.
- Constrained popup viewports reflow without removing the initial 561px intrinsic width Chrome needs while opening its toolbar popup. Dialogs fit the available height. Header controls remain beneath modal sheets.
- Search labels take their own layout space; search icons stay inside the input rather than drifting with their parent's padding.

## Validation

Evidence directory in the parent workspace: `build/safe-upgrade/evidence/codex-20261012/`.

| Check | Result |
| --- | --- |
| Full Vitest suite, Node 24.19.0 (`wa5-all-unit-final.log`) | 225 files passed, two skipped; 1,780 tests passed, 18 skipped. Local-chain tests require their explicit local runner. |
| Dialog/input/tab/switch/checkbox regressions (`wa5-final-regressions.log`) | 11 passed, including a real nested currency-picker dismissal and cached modal reopen. |
| TypeScript and changed-file lint (`wa5-typecheck-final.log`, `wa5-lint-final.log`) | Passed. The subsequent search-only layout change also passed type/lint (`wa5-search-*`). |
| Development extension build (`wa5-build-search.log`) | Passed. Existing dependency annotation warnings remain. |
| Offline Chrome 147.0.7727.15 visual matrix (`wa5-current/`) | 19 screenshots plus initial toolbar-size check. Full, Lite, Reduced, high contrast, reduced motion, forced colors, 320px width and 281×300 CSS viewport covered. No horizontal overflow, out-of-viewport dialog, obscured sheet controls, search-label/button overlap or out-of-field search icon. |
| Shared generator tests | Seven passed; JSON/CSS token SHA-256 `18180aa767b87b8ac0bb767622e172328d95145817a1475a840905eec55b4315`. |

The 281×300 viewport checks the layout space equivalent to 200% zoom; it does not claim an actual browser-toolbar zoom interaction. Screenshots use public fixtures and offline mocked balances, and submit no transactions. The full unit run preceded the last search-only CSS/layout adjustment, which was checked by the browser matrix and type/lint.

## Remaining screen and release gates

Complete W-A6 screen composition, screen-specific pending/disabled explanations and focusable-disabled action behavior, search clearing/result announcements, all locale review, and the per-screen accessibility checks in the design plan. Keep action guards intact when changing disabled semantics. Rebuild production artifacts and repeat source/bundle/release audits after integration. This document does not mark the full design phase or the release ready.
