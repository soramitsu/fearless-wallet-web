# Shared Telemetry Hooks – Exploration

Updated: 2024-10-07  
Owner: Platform DX (Kenji Yamamoto)

## Background

- Telemetry utility (`src/utils/perpsExoticTelemetry.ts`) provides an in-memory queue + transport abstraction. It currently only emits events for TON balances (`ton.balance.utility/jetton`) and unit tests cover queue semantics.
- Swaps, pools, and extension flows still rely on ad-hoc `console.info` or omit instrumentation entirely. We lack consistent event naming, buffering, or backpressure handling across surfaces.
- Goal: establish shared hooks so any module (Vue UI, background runtime, service worker) can record telemetry without duplicating plumbing, while keeping payloads privacy-conscious.

## Current Gaps

1. **Entry points**
   - Swap/pool components call directly into services (`src/screens/swap/**`, `src/extension/background/extension-base/src/services/pools-service/**`) with no telemetry injection point.
   - Background handlers (e.g., `Extension.ts`, WalletConnect, staking) have no dependency on the telemetry utility, so events cannot be recorded without circular imports.

2. **Transport**
   - `PerpsExoticTelemetry` accepts a transport but the singleton uses a no-op implementation. There is no adapter to forward events to:
     - Browser extension analytics (e.g., `chrome.runtime.sendMessage` to native host).
     - Soramitsu observability stack (Kafka/Amplitude/etc.).
   - Missing backoff/retry; `flush` assumes the transport always succeeds synchronously.

3. **Schema & naming**
   - Only `ton.balance.*` events exist; no documented schema for swaps (`swap.quote`, `swap.sign`, `swap.fail`), pools (`pool.add`, `pool.remove`), or extension lifecycle events.
   - No correlation IDs for multi-step flows; analytics cannot tie `swap.quote` to `swap.sign`.

4. **Delivery triggers**
   - Nothing calls `telemetry.flush()` except ad-hoc unit tests. In production the queue grows up to 50 entries, then older events are dropped silently.

## Requirements & Constraints

- Reuse a single telemetry queue across background + popup to avoid duplicate buffering.
- Provide low-cost instrumentation (no blocking network call on the UI thread).
- Ensure MV3 service worker can flush before suspension (hook into `runtime.onSuspend` or existing `timeoutService`).
- Allow feature teams to publish custom contexts (network, account type) without leaking PII.

## Proposed Architecture

### 1. Central dispatcher (Phase 1)

- Create `src/telemetry/dispatcher.ts` that wraps the singleton and registers:
  - Browser transport: post events to `chrome.runtime.sendMessage('pri(telemetry.flush)')` for the background to handle.
  - Web transport: issue `fetch` to telemetry endpoint (configurable env var) with exponential backoff.
- Background handler (`Extension.ts`) listens for `pri(telemetry.flush)` and writes events to:
  - Temporary storage (IndexedDB/localStorage) when offline.
  - Upload endpoint when online, with retry + jitter.
- Extend `SubscriptionService` or `TimeoutService` to flush the queue every N seconds or before service-worker suspend.

### 2. Hook primitives (Phase 1)

- Export typed helpers:
  ```ts
  recordSwapEvent('quote.requested', { assetIn, assetOut, source: 'popup' });
  recordPoolEvent('liquidity.add.submit', { poolId, amountUSD });
  recordExtEvent('background.start');
  ```
- Each helper prefixes names (`swap.*`, `pool.*`, `ext.*`) and injects shared metadata (network, wallet ecosystem, build version).

### 3. Flow instrumentation (Phase 2)

- **Swaps (`src/screens/swap`, `src/extension/background/extension-base/src/sora/swap/**`):\*\*
  - On quote request start/success/fail.
  - On transaction build/sign/broadcast events.
  - Include strategy (PSwap, path length), slippage, estimated fee bucket.
- **Pools (`src/screens/pool`, `src/extension/background/extension-base/src/services/pools-service`):**
  - Track add/remove liquidity attempts, pool IDs, share of pool, failure reasons.
  - Emit `pool.rewards.claim` events.
- **Extension lifecycle (`src/extension/background/extension-base/src/background/handlers/Extension.ts`):**
  - Record startup (`ext.runtime.start`), service worker suspend/resume, fatal errors.
  - Monitor WalletConnect session approvals/rejections.

### 4. Privacy & Sampling (Phase 2)

- Strip or hash wallet addresses; include network + coarse asset buckets (e.g., `assetCategory: 'XOR'`).
- Add sampling controls (per-event or global) to avoid flooding telemetry.
- Provide opt-out toggle in settings; respect existing privacy policy.

### 5. Testing & Tooling (Phase 3)

- Unit tests for helper functions to ensure metadata injection.
- Integration test: mock transport, simulate swap flow, assert event order.
- DevTools panel or CLI script to inspect local telemetry queue for debugging.

## Deliverables

1. Telemetry dispatcher module + background flush handler.
2. Helper methods (`recordSwapEvent`, `recordPoolEvent`, `recordExtEvent`) with shared metadata injection.
3. Instrumentation PRs for swaps, pools, and key extension flows.
4. Documentation in `docs/runtime/telemetry.md` covering schema, naming conventions, and opt-out behaviour.

## Open Questions

1. Which backend will receive telemetry? (Amplitude, Google Analytics 4, internal Kafka?) Determines payload/auth.
2. Do we need user consent per jurisdiction? (GDPR/JP) Might require gating behind explicit toggle.
3. Should telemetry support replay from local storage after offline periods?

## Next Steps

| Task                                             | Owner             | Status  | Notes                                         |
| ------------------------------------------------ | ----------------- | ------- | --------------------------------------------- |
| Implement dispatcher + background flush pipeline | Platform DX       | Pending | Blocked on backend decision.                  |
| Define event schema + naming conventions         | Product Analytics | Pending | Should cover swaps/pools/wallet flows.        |
| Add swap instrumentation via helpers             | Web UX            | Pending | After helpers land.                           |
| Add pool + extension lifecycle instrumentation   | Runtime Core      | Pending | Coordinate with WalletConnect/staking owners. |
