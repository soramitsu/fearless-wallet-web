# Remote action switches in `web_config.json`

This file prepares the `actions` block for
`soramitsu/shared-features-utils` `appConfigs/web_config.json`. Nothing here is
published by the extension release. Publishing the shared config is a separate,
reviewed operations change.

## Policy in 4.2.0

The extension compiles one release policy,
`RELEASE_DEFAULT_ACTIONS` in
`src/extension/background/extension-base/src/services/action-capability-service/index.ts`.
The background (which enforces every mutation) and the popup (which decides what
to show) both apply it through `resolveActionCapabilities`.

| Capability             | Guards                                        | Compiled in 4.2.0 |
| ---------------------- | --------------------------------------------- | ----------------- |
| `polkaswap`            | Polkaswap swap, liquidity pools               | on                |
| `demeter`              | Demeter farming mutations (positions visible) | off               |
| `polkamarkt`           | Polkamarkt trading                            | off               |
| `crossChainXcm`        | Wallet XCM routes                             | off               |
| `crossChainSoraBridge` | SORA ↔ Substrate bridge                       | off               |
| `crossChainLiberland`  | SORA ↔ Liberland bridge                       | off               |

Remote config is **veto-only**:

- An explicit `false` switches a capability off for every user (a kill switch).
- An absent key, a non-boolean value, a failed fetch or a remote `true` never
  switches on a capability that is compiled off. Turning one of those on needs a
  new build with funded route evidence.
- A veto is **sticky**. Both the background (`chrome.storage` key
  `actionCapabilities`, schema 2) and the popup (`localStorage` key
  `feature_action-capabilities-v2`) remember every explicit value. The veto stays
  in force offline and when a later config omits the key. Only a later explicit
  `true` lifts it, and only for a capability that is compiled on.

Snapshots written by internal builds before 4.2.0 (schema 1, and the popup key
`feature_action-capabilities`) resolved missing keys to `false` before storing
them, so a real veto cannot be told apart from a default. The published config
never contained an `actions` block, so these snapshots are ignored and left in
place. Users upgrading from 3.0.5 have no snapshot at all.

## Recommended block

Make every switch explicit so each kill switch is visible and auditable in the
config history. Keep the existing `fiat` block exactly as it is.

```json
{
  "actions": {
    "polkaswap": true,
    "demeter": false,
    "polkamarkt": false,
    "crossChainXcm": false,
    "crossChainSoraBridge": false,
    "crossChainLiberland": false
  }
}
```

The `false` values for compiled-off capabilities change nothing in 4.2.0. They
document intent and stay effective if a later build compiles one of them on.

## Operating the switch

- **Pause Swap and Pools:** set `"polkaswap": false`. The popup shows the
  disabled reason, and the background refuses swap and pool submissions at
  submit time, including a swap that was already in review.
- **Resume Swap and Pools:** set `"polkaswap": true`. Deleting the key does not
  resume them for users who already received the veto.
- The popup fetches the config each time it opens. The background fetches it
  whenever it starts (browsers stop an idle extension background and restart it
  on demand) and keeps its last state until then.
