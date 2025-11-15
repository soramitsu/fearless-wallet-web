# TON Balance Polling Assessment

Updated: 2024-10-07  
Owner: Runtime Core (Maria Petrova)

## 1. Current Behaviour

Path: UI `subscribeBalance` → `Extension.subscribeBalance` → `SubscriptionService.fetchNetworkBalances` → `BalanceService.fetchBalance` → `TonBalance.fetchBalance`.

- `TonBalance.fetchBalance` (`src/extension/background/extension-base/src/services/ton-balance/TonBalance.ts`) executes **two blocking REST calls per network** (`accounts.getAccount`, `accounts.getAccountJettonsBalances`) and emits one telemetry event per asset (`telemetry.record('ton.balance.*')`).
- Unlike EVM/Substrate services, TON fetches **never consult `BalanceLookupRegistry`** – there is no TTL or dedupe. Every caller (manual `pri(fetch.balance)`, staking forms, account switch) fans out to the TON APIs immediately.
- `SubscriptionService` only triggers a TON fetch when:
  1. the background starts (`start()` bootstraps all accounts),
  2. the selected account or network selection changes (`serviceInfoSubject` update).
     There is **no periodic refresh** afterwards, so balances remain stale until the user forces a fetch via `pri(fetch.balance)` (used by staking forms) or re-selects the account.
- Each fetch writes every jetton back to storage via `BalanceService.setBalanceItem`, which then schedules a storage sync and re-broadcasts the whole balance map through `balanceSubject`. A wallet with 1 TON + 10 jettons produces 11 storage writes and 11 telemetry events per refresh.
- Price side effects: `TonBalance.fetchJettonsAsset` mutates `DEFAULT_PRICES` and immediately calls `pricesService.setPriceValue`, so every balance poll also recomputes TON fiat quotes even if nothing changed.

## 2. Observed Impact

| Scenario                            | Calls per refresh                                                       | Notes                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 TON account, 1 network, 5 jettons | 2 external HTTP requests, 6 `setBalanceItem` writes, 6 telemetry events | No throttling; repeated rapidly when UI opens staking forms (they call `pri(fetch.balance)` before signing). |
| 3 TON accounts (main + watch-only)  | 6 HTTP calls per refresh                                                | Requests execute sequentially per account/network, blocking the balance queue for ~600–900 ms total.         |
| Idle popup (no manual fetch)        | 0 calls after boot                                                      | Balances go stale because nothing schedules a refresh.                                                       |

Side-effects:

- `storage/balances` churns even on no-op fetches because every response is written with a fresh timestamp, triggering `BalanceService.scheduleBalanceSync`.
- `telemetry.record` spam: the jetton loop fires on every poll, which inflates event volume and hinders anomaly detection.
- When the TON indexer is slow, the entire balance queue waits for the REST round-trip and delays Substrate/EVM updates (single-threaded executor).

## 3. Event Sources & Options

### 3.1 TonAPI / Toncenter streaming

- TonAPI v2 exposes `wss://tonapi.io/v2/ws` subscriptions (`accounts.subscribe`, `accounts.subscribeJettons`) that push enriched balance deltas per account and jetton wallet.
- Toncenter’s RPC (`wss://toncenter.com/api/v2/ws`) supports `subscribe_address` + `subscribe_jetton_wallet` for raw transactions; a lightweight adapter could translate events into balance diffs.
- Delivery: both streams keep the connection alive with periodic pings; chrome MV3 service workers require a keep-alive (existing `timeoutService` heartbeats can piggyback).

### 3.2 Tonhub push / Tonconnect

- Not ideal here: push targets mobile clients and requires device tokens. No background transport for browser extensions yet.

### 3.3 Cron-based refresh

- Fallback: schedule `TonBalance.fetchBalance` via `CronService` (e.g., every 60 s) with per-address TTL gating. Still polling, but predictable and deduped, and it removes the need for UI-driven manual refreshes.

## 4. Recommended Plan

### Phase 1 – Contain polling impact (P1)

1. **Add TTL & caching**
   - Plug `BalanceLookupRegistry` into the TON path (same `BALANCE_FETCH_TTL_MS`, 30 s default).
   - Expose `force`/`skipThrottle` on `pri(fetch.balance)` so forms can still request a fresh snapshot.
2. **Throttle telemetry + storage writes**
   - Only emit `telemetry.record` when the value actually changed.
   - Short-circuit `setBalanceItem` if `total`/`transferable` is unchanged to avoid re-syncing storage.
3. **Background refresh loop**
   - Use `cronService` to call a new `balanceService.refreshTonBalances()` every 60 s (only for active TON accounts).
   - Respect the TTL to avoid overlapping polls if the user also hits manual refresh.

### Phase 2 – Event-driven updates (P2)

1. **Build `TonEventService`**
   - Manage a single WebSocket connection to TonAPI/Toncenter, subscribe to each active TON wallet & jetton wallet.
   - On event, call `balanceService.setBalanceItem` with the delta, mark TTL entry to prevent an immediate REST poll.
2. **Failure & backoff**
   - Reconnect with exponential backoff, fall back to Phase-1 polling when offline.
   - Surface connection status in DevTools (so QA can check streaming health).
3. **Metrics & alerts**
   - Record streaming lag / reconnect counts via `telemetry.record('ton.balance.stream.*')`.
   - Alert when we revert to polling for more than N minutes.

### Phase 3 – Jetton price sync (P3)

1. Decouple jetton price ingestion from balance polling; fetch price diffs inside `PricesService` instead.
2. Cache jetton metadata (icon, precision) so we don’t rebuild it on every balance update.

## 5. Open Questions

1. Which TON provider do we prefer for streaming? (`tonapi.io` has richer metadata but stricter rate limits; `toncenter` is closer to our existing REST client.)
2. Should we persist APY/price snapshots for TON similarly to Substrate to avoid repeated conversions?
3. Can we share a single websocket between the wallet and future TON dApp interactions (TonConnect) to keep service worker wake-ups minimal?

## 6. Next Steps

| Task                                                 | Owner        | Status  | Notes                                            |
| ---------------------------------------------------- | ------------ | ------- | ------------------------------------------------ |
| Implement TTL + cron-driven refresh for TON balances | Runtime Core | Pending | Reuse `BalanceLookupRegistry` and `CronService`. |
| Prototype `TonEventService` against TonAPI           | Runtime Core | Pending | Verify MV3 service worker keep-alive strategy.   |
| Reduce telemetry/storage spam (emit only on change)  | Platform DX  | Pending | Can ship alongside Phase 1.                      |
