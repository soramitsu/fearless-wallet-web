# WalletConnect v2 Push/Notification Evaluation

Updated: 2024-10-07  
Owner: Runtime & Extensions (Kenji Yamamoto)

## Objectives

- Determine if WalletConnect v2 Notify/push can slot into the existing background bridge without regressing session handling.
- List the API/permission gaps inside the extension (service worker, storage, UI) so we can size the work before the Runtime Parity sprint.
- Outline an incremental rollout plan with validation steps across Chrome MV3 and Firefox MV2.

## Current Stack Snapshot

- Wallet-side background service uses `@walletconnect/sign-client` (`src/extension/background/extension-base/src/services/wallet-connect-service/index.ts`) with bespoke storage backed by the browser extension store. It manages session lifecycle events and forwards requests to the `requestService`.
- The dApp companion path (`src/extension/background/extension-base/src/services/wallet-connect-service/dapp.ts`) leans on `@walletconnect/universal-provider` to originate pairings and to reuse the same storage adapter so mobile pairings survive restarts.
- Neither side initializes or references `@walletconnect/notify-client`; no `notify` keys or subscriptions are persisted in storage and the manifest lacks `notifications` permission, so OS-level notifications cannot be surfaced today.
- All WalletConnect events are handled inside the persistent background worker (service worker on Chrome MV3, persistent script on Firefox MV2). There is no dedicated channel for passive updates—the popup/UI learns about activity only when it is open and subscribes via `requestService`.

## WalletConnect Notify Primer

- Notify is a separate capability flag on the relay. Wallets must instantiate `@walletconnect/notify-client` (or use `sign-client` helpers) with the same Project ID, then register each account’s push token with the Notify server.
- Each subscription associates: project ID, account (`namespace:chain:address`), and a delivery target (`token`, `type`). Tokens are typically APNs/FCM strings, but the protocol also allows WebSockets-only delivery (no push) by listening to Notify events while connected.
- Inbox APIs expose `notify.list()`/`notify.getNotifications(topic)`; clients are responsible for persistence, deduplication, and presenting notifications when the UI is not in focus.

## Compatibility Findings

### 1. Transport & Lifecycle

- Chrome MV3 service workers are suspended when idle. Maintaining a long-lived Notify WebSocket would require `chrome.alarms` keep-alives or moving the listener into the `requestService` alarm loop. Without this, notifications would only sync when the popup is opened (defeats push expectations).
- Firefox MV2 still has persistent backgrounds, so Notify can stay connected, but we must keep code symmetrical and gate features per browser.

### 2. Identity, Storage, and Multisession

- `WalletConnectService` already stores session/pairing data under `wc@2:*` keys via `WalletConnectStorage`. Notify would add new keys (`notify_subscriptions`, `notify_messages`). Storage growth is acceptable, but we must namespace to avoid collisions and add migration guards in `scripts/release/validate-env.js` rollout notes.
- Accounts saved in `keyringService` include `chains` metadata (see `dapp.ts:~120`). We can extend that schema with a `notifyTopics` array so we know which accounts should receive alerts without re-querying the Notify API on every cold start.

### 3. UI & UX Surfaces

- The popup currently shows WalletConnect requests in the Meta Requests drawer. For notifications, we need:
  - A background-to-UI broadcast channel (e.g., new `NotificationStore` in Pinia) so unread counts survive popup reloads.
  - OS-level notification surface via `chrome.notifications`/`browser.notifications` for when the popup is closed. Permission and UX copy must be added to onboarding.
- We also need per-dApp controls (mute/unsubscribe). These can live next to the existing WalletConnect session list.

### 4. Security & Consent

- Subscribe only after explicit user opt-in. The Notify registration call must be scoped to the same accounts accepted during the session proposal; otherwise we risk leaking addresses to dApps that never completed pairing.
- Tokens (FCM/WebPush) are sensitive secrets—store them encrypted alongside the existing `storage` encrypted blobs or reuse the extension password vault (if available) before writing to `chrome.storage`.

### 5. Dependencies & Permissions

- Add `@walletconnect/notify-client` (~8 KB gzipped) plus optional `@walletconnect/push-notifications` helpers.
- Manifest changes:
  - Chrome MV3: add `notifications` and possibly `gcm` permissions plus declarations for `push` service worker events.
  - Firefox MV2: add `notifications` permission.
- Backend environment variables: Notify currently reuses the same Project ID, but production push requires registering the wallet under the WalletConnect Cloud portal (no Jenkins changes unless we split IDs).

## Recommended Implementation Plan

1. **Foundations (P1)**
   - Integrate `@walletconnect/notify-client` in a new background service (`WalletConnectNotifyService`). Share the existing storage adapter and hook lifecycle to `WalletConnectService` so we reuse session metadata.
   - Build a polling fallback (sync every 5 minutes via `chrome.alarms`) to support MV3 suspension until we prove keep-alive stability.

2. **Subscription & Consent (P1)**
   - Extend the connect approval flow (`requestService.addConnectWCRequest`) with a Notify consent step: allow, deny, always ask. Persist preference per dApp/topic.
   - store subscription topics inside `keyringService.saveAddress` metadata for quick lookup.

3. **Notification delivery (P1)**
   - Add a lightweight repository in the background that stores unread notifications (id, dApp metadata, payload, timestamp). Expose over the existing message channel so the popup can render a badge.
   - Wire `chrome.notifications.create` / `browser.notifications.create` as an optional surface gated by the same consent flag.

4. **Device push tokens (P2)**
   - Evaluate WebPush vs. polling. If we opt into WebPush, generate VAPID keys and store the browser subscription endpoint, then pass it to Notify as the `account`’s delivery target.
   - Handle token rotation and revocation (Chrome invalidates Push subscriptions on extension update).

5. **QA & Rollout (P2)**
   - Unit tests: expand `tests/unit/walletConnectService.spec.ts` (or add new spec) to cover notify subscription serialization, opt-in logic, and reconnection.
   - Manual flows: Chrome MV3 suspend/resume, Firefox background persistence, offline re-sync.

## Next Actions

| Task                                                         | Owner        | Status  | Notes                                            |
| ------------------------------------------------------------ | ------------ | ------- | ------------------------------------------------ |
| Prototype `WalletConnectNotifyService` with polling fallback | Runtime Core | Pending | Target branch `feature/wc-notify`.               |
| Add UI consent + settings toggles                            | Web UX       | Pending | Depends on background API from prototype.        |
| Decide on push transport (WebPush vs. polling)               | Platform DX  | Pending | Requires legal/security review for WebPush keys. |

Open questions:

1. Are we comfortable shipping without OS notifications (polling-only) in the first milestone?
2. Does Soramitsu security require per-dApp allowlists before we store long-lived Notify subscriptions?
3. Should we reuse the existing `PROJECT_ID_EXTENSION` or request a dedicated Notify project to isolate rate limits?
