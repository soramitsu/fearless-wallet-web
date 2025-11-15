# Vue 3 Beta QA Checklist

Updated: 2024-10-07  
Owners: QA Guild, Web Platform (Michael Takemiya, Alexei Sidorov)

## Goal

Verify that the Vue 3 branch is feature-complete, stable across extension + web builds, and visually aligned with the refreshed Soramitsu tokens ahead of the beta review on 2024-11-04.

## Distribution & Scheduling

- Shared with QA guild via `#fearless-web-qa` on 2024-10-07 (owners: QA Guild leads, Michael Takemiya).
- Run #1 scheduled for 2024-10-09 focusing on Chrome MV3 + Firefox MV2 extension builds; track prep/results in `docs/testing/vue3-beta-qa-run-2024-10-09.md` and report outcomes back to `docs/planning/vue3-beta-plan.md`.

## Preconditions

- Install dependencies and build artifacts once before the pass:
  - `yarn install`
  - `yarn build:extension:all`
  - `yarn build:web`
- Use a profile with at least two funded accounts (Substrate + EVM) and pools/staking positions so UI screens are populated.
- Enable Soramitsu design tokens/variables from `src/styles/soramitsu-variables.scss` in the build (already bundled, just confirm no overrides were skipped).
- Clear prior Vuex data from the browser profile to avoid conflicts with the Pinia stores (`chrome://extensions → Inspect views → Application storage → Clear site data`).

## Checklist

### 1. Extension – Core Flows (Chrome MV3 + Firefox MV2)

1. **Onboarding**
   - Import existing wallet and create a new mnemonic; confirm both paths land in the dashboard without console errors.
   - Switch networks to confirm the new Pinia-backed network store hydrates instantly after unlock.
2. **Wallet (Balances)**
   - Verify fiat + token pairs render identically to Vue 2 (check Substrate, EVM, and TON assets).
   - Trigger a manual refresh and ensure background balance updates reflect in under 5 seconds.
3. **Swap**
   - Execute a SORA swap and a substrate swap (e.g., DOT ↔ KSM) using small amounts; confirm confirmation modals and price impact banners match designs.
   - Cancel mid-flow to ensure dialogs close and state resets (no stale pinia state).
4. **Pools**
   - Enter an existing pool position and inspect share/APR values.
   - Add + remove liquidity once; confirm toasts and analytics cards update.
5. **Staking**
   - Run the high-level smoke steps from `docs/testing/staking-smoke-checklist.md`.
   - Confirm reward history entries render with correct labels and icons.
6. **Settings**
   - Toggle theme, currency, and language; ensure changes persist across reload/unlock.
   - Enable/disable experimental networks and verify the router guards handle hidden routes.
7. **WalletConnect**
   - Connect to a known DApp (use staging endpoint) and approve a signature request; confirm the background bridge logs no warnings.

### 2. Web App Regression (`/wallet`, `/swap`, `/staking`, `/settings`)

1. Serve the built assets (`yarn serve:dist` or local static server) and open each route.
2. Validate the router handles deep links (direct navigation to `/swap` and `/staking`).
3. Confirm scroll/virtualized lists mount cleanly (Balances table, staking history) with no hydration mismatch warnings in the console.
4. Test responsive breakpoints (≥1280px desktop, 1024px tablet, 375px mobile) to ensure layout tokens and typography scale correctly.

### 3. Pinia Hydration & Devtools

1. Open Vue Devtools (beta channel) and confirm Pinia stores display without warning banners.
2. Lock/unlock the wallet twice to ensure persisted stores (`accounts`, `networks`, `prices`) restore without throwing `undefined` access errors.
3. From Devtools, time-travel a Pinia action (e.g., `balances/fetch`) and verify the UI reflects the reverted state.

### 4. Design Tokens & Theming

1. Compare light/dark tokens to Soramitsu reference (focus on background, surface, border, primary, and success colors).
2. Validate typography: headings use the configured `Sora` variable font; mono inputs fall back to `Roboto Mono`.
3. Check buttons, tooltips, inputs for focus states that meet accessible contrast ratios.

### 5. Release Artifacts & Logging

1. Inspect `dist/` artifacts produced by `yarn build:web` and the extension bundles from `yarn build:extension:all`; confirm manifests report version `3.x`.
2. Capture console/network logs for any warning and file them under the `vue3-beta` Jira tag.
3. Summarize pass/fail status, attach screenshots of critical flows, and post to `#fearless-web-qa` for review.

## Exit Criteria

- All checklist items executed on both Chrome MV3 and Firefox MV2 extension builds plus the standalone web build.
- No P0/P1 regressions open; lower-severity issues documented with repro steps.
- Updated results recorded in `docs/planning/vue3-beta-plan.md` (Verification Tasks section) ahead of the Sprint 47 review.
