# Runtime Refactors — Completion Notes

Updated: 2024-10-07  
Owner: Runtime Core (Maria Petrova)

## Scope Recap

1. **Network metadata normalization** – consolidate fiat, grouping, and asset tags into reusable helpers so UI + background share the same sources.
2. **Balance service consolidation** – ensure Substrate/EVM handlers reuse a shared lookup/teardown layer, keep storage writes throttled, and unblock future ecosystems (TON).
3. **Pools metadata from background** – expose typed payloads through the background runtime, letting the UI read/persist pool data directly from the new services.
4. **Staking parameter/history clean-up** – finalize metadata unions for Sora/Equilibrium staking, align store types, and wire the background service to the UI.
5. **Randomness + swap feed guards** – harden helper utilities so price feeds and random sources no longer fall back to insecure implementations.

## Delivered Changes

| Area                  | Highlights                                                                                                                                                                                           | References                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Network helpers       | `src/helpers/networkGroups.ts`, `src/helpers/currencies.ts` now export normalized sets; Pinia stores consume them via `createNormalizedNetworkNameSet`.                                              | `src/helpers/networkGroups.ts`, `src/helpers/currencies.ts`                                                |
| Shared balance lookup | `BalanceLookupRegistry` + helper functions (`src/helpers/balances.ts`) gate Substrate/EVM fetches; `src/extension/background/extension-base/src/services/balance-service/**` share caching/teardown. | `src/helpers/balances.ts`, `src/extension/background/extension-base/src/services/balance-service`          |
| Pools pipeline        | Background pools service emits typed payloads consumed by Pinia store (`src/extension/background/extension-base/src/services/pools-service/index.ts`, `src/stores/pools/**`).                        | `src/stores/pools/index.ts`, `src/extension/background/extension-base/src/services/pools-service/index.ts` |
| Staking metadata      | Staking store + service now expose typed network params/history unions for Sora/Equilibrium; Pinia store slices use the new metadata.                                                                | `src/stores/staking/index.ts`, `src/sora/staking/**`                                                       |
| Randomness & swaps    | Helper in `src/helpers/numbers.ts` and Sora swap modules guard randomness sources and price feeds, eliminating insecure fallbacks.                                                                   | `src/helpers/numbers.ts`, `src/sora/swap/**`                                                               |

## Verification

- Unit tests updated/added for balance service, pools, staking stores, and helper utilities (`tests/unit/balanceService.spec.ts`, `tests/unit/networkGroups.spec.ts`, `tests/unit/poolsStore.spec.ts`, etc.). Run with `yarn format:check` + `yarn lint:ci` + `yarn test:unit`.
- Manual smoke (runtime parity sprint) validated pools & staking flows, plus swap feed guards.
- Telemetry + logging confirm fewer duplicate balance fetches after lookup registry landed.

## Follow-ups

- TON-specific fetch throttling/event-driven updates are tracked separately (`docs/planning/ton-balance-polling.md`).
- Pools/staking telemetry will piggyback on the shared telemetry hooks once implemented.
