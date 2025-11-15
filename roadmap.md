# Fearless Web Roadmap

## Now — Strictness & Data Hygiene

- [x] Replace temporary codec aliases (`any`/`unknown`) once upstream Polkadot typings are available.
- [x] Replace remaining `as unknown as` casts in asset, swap, and bridge helpers with shared codec utilities.
- [x] Finish Sora history typing (flesh out method unions and data payloads in `src/interfaces/history.ts`, `src/stores/staking/types.ts`, `src/stores/staking/getters.ts`).
- [x] Tighten Wallet history typing across network helpers (`src/interfaces/networks.ts`, `src/helpers/common/index.ts`).
- [x] Rename EVM balance descriptors (`name` → `networkName`) and clean up special-option plumbing (`src/extension/background/extension-base/src/api/evm/types.ts`).
- [x] Extend network enums so staking/history providers can target new assets (`src/interfaces/networks.ts`).

## Now — Runtime Hardening & Coverage

- [x] Backfill tests and error handling for TON balances/jettons to keep pricing caches consistent (`src/extension/background/extension-base/src/services/ton-balance/TonBalance.ts`, `tests/unit/tonBalance.spec.ts`) — Owner: Maria Petrova — Priority: P0 — Completed 2024-09-16 (see `docs/planning/runtime-hardening.md`).
- [x] Stabilize balance cache updates by consolidating timeout-driven publishing and storage writes (`src/extension/background/extension-base/src/services/balance-service/index.ts`, `tests/unit/balanceService.spec.ts`) — Owner: Alexei Sidorov — Priority: P0 — Completed 2024-09-16 (see `docs/planning/runtime-hardening.md`).
- [x] Document Sora util bootstrap invariants and add runtime guards for lazy-loaded modules (`src/extension/background/extension-base/src/services/utils/sora.ts`, `docs/runtime/sora-loader.md`) — Owner: Kenji Yamamoto — Priority: P1 — Completed 2024-09-16.
- [x] Unblock staking getters by wiring the pending network metadata and replacing placeholder TODOs (`src/stores/staking/getters.ts`, `src/stores/networks/actions.ts`) — Owner: Daria Smirnova — Priority: P1 — Completed 2024-09-16.

## Next — Vue 3 Upgrade & Runtime Refactors

- [x] Vue 3 migration
  - [x] Audit component options usage and convert high-traffic views to `<script setup>` (`src/screens/**`, `src/components/**`).
  - [x] Replace Vuex store wiring with Pinia modules and strict typing (`src/store/index.ts`, `src/stores/**`).
  - [x] Update the root bootstrap to `createApp` + composition-friendly plugin registration (`src/main.ts`, `src/App.vue`, `src/plugins/**`).
  - [x] Align router guards and async data flows with Vue 3 lifecycles, removing legacy `beforeRouteEnter` shims (`src/router/index.ts`, `src/screens/**`).
  - [x] Upgrade Soramitsu UI and third-party plugins to Vue 3-compatible releases and adapt global styling tokens (`package.json`, `src/plugins/**`, `src/styles/**`).
  - [x] Refresh the unit/integration harness for Vue Test Utils v2 and update mount helpers (`tests/unit/**`).
- [x] Runtime refactors
  - [x] Normalize network grouping, fiat metadata, and asset tags into a single source of truth (`src/helpers/networkGroups.ts`, `src/helpers/currencies.ts`).
  - [x] Rebuild balance lookups to share caching + subscription teardown across Substrate/EVM handlers (`src/helpers/balances.ts`, `src/extension/background/extension-base/src/services/balance-service/**`).
  - [x] Source pools metadata from the background runtime and surface typed payloads to the UI (`src/extension/background/extension-base/src/services/pools-service/index.ts`, `src/stores/pools/**`).
  - [x] Finalize staking parameter metadata and history unions for Sora/Equilibrium (`src/stores/staking/**`, `src/sora/staking/**`).
  - [x] Harden randomness utilities and swap price feeds to avoid insecure fallbacks (`src/helpers/numbers.ts`, `src/sora/swap/**`).
- [x] History & bridge improvements
  - [x] De-duplicate history fetching paths and enforce per-asset endpoints with typed responses (`src/history/fetchingHistory.ts`, `src/stores/networks/actions.ts`).
  - [x] Move history/bridge parsing to background workers and tighten message payload guards (`src/extension/background/extension-base/src/page/PostMessageProvider.ts`, `src/extension/background/extension-base/src/background/handlers/**`).
  - [x] Validate MST weights/public keys during bridge submissions and surface actionable errors (`src/extension/background/extension-base/src/api/substrate/sora/bridge.ts`, `src/sora/mstTransfers/index.ts`).
  - [x] Align Sora bridge metadata with the latest type definitions and add regression coverage (`src/sora/typeDefinitions/**`, `tests/unit/bridgeProxy*.spec.ts`).

## Later — Tooling, DX & Release Readiness

- [x] Align Polkadot dependency versions to silence keyring warnings and remove legacy util shims (`package.json`, `src/sora/BaseApi.ts`, `src/sora/swap/index.ts`).
- [x] Tighten Jest/TS configs and lint guardrails (block new `@ts-ignore`, add type-safety lint rules, document new helper patterns) (`jest.config.js`, `tsconfig.json`, `eslint.config.mjs`).
  - [x] Document the Pinia vs. Vuex transition plan and capture liquidity proxy/type-def TODOs for the util v1.33 upgrade (including shorthand alias cleanup) (`docs/pinia-migration.md`, `src/sora/liquidityProxy/**`).
- [x] Add regression coverage for bridge history formatting and MST edge cases (`tests/unit/bridgeProxyEthMethods.spec.ts`, `tests/unit/bridgeProxySubAssets.spec.ts`, `tests/unit/mstTransfers.spec.ts`).
- [x] Establish a release checklist covering extension signing, manifest generation, and changelog automation (`Jenkinsfile`, `src/extension/makeManifest.js`, `.github/workflows/**`).

## Backlog — Research & UX Enhancements

- [x] Evaluate WalletConnect v2 push/notification support and compatibility with the existing background bridge (`src/extension/background/extension-base/src/services/wallet-connect-service/**`, `docs/planning/walletconnect-push.md`).
- [x] Prototype richer staking dashboards with APY history and validator metadata (`src/screens/Staking/**`, `src/stores/staking/**`, `tests/unit/stakingStore.spec.ts`).
- [x] Assess TON balance polling impact and potential event-driven updates (`src/extension/background/extension-base/src/services/ton-balance/TonBalance.ts`, `docs/planning/ton-balance-polling.md`).
- [x] Explore shared telemetry/analytics hooks for swaps, pools, and extensions (`src/utils/perpsExoticTelemetry.ts`, `tests/unit/PerpsExoticTelemetry.spec.ts`, `docs/planning/telemetry-hooks.md`).

## Milestones & Checkpoints

- **Vue 3 Beta cut** – Target a feature-complete Vue 3 branch with Pinia stores, critical screen smoke tests, and updated design tokens ready for stakeholder review. Target: 2024-11-04 — Owners: Michael Takemiya & Alexei Sidorov.
- **Runtime parity sprint** – Deliver unified balance/pools/staking services with background-driven metadata and coverage on Substrate, EVM, and TON flows. Target: 2024-10-18 — Owners: Maria Petrova.
- **Release readiness drill** – Dry-run extension builds/signing, publish changelog automation, and execute regression packs ahead of store submissions. Target: 2024-12-02 — Owners: Kenji Yamamoto.
- **Post-Vue retrospectives** – Capture migration lessons, finalize documentation debt (Pinia, Sora loader, release checklist), and plan the next DX/tooling iteration. Target: 2024-12-13 — Owners: Daria Smirnova.

## Completed

- Removed `ts-nocheck` across Sora pallets, math, DEX, API surfaces, and staking/order book modules.
- Replaced `fearlessWallet` placeholder with a typed EIP‑1193 proxy and added runtime guards for WalletConnect requests.
- Defined cross-env `browser`/`chrome` globals, added a cross-browser WalletConnect storage adapter, and removed Sora sync suppressions by creating typed account results.
- Tightened bridge proxy request formatting and populated missing metadata (`src/sora/bridgeProxy/eth/**`).
