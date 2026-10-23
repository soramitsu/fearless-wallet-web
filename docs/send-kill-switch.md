# Solana send kill switch

Solana sends ship enabled in `3.0.10`. The build has no flag to turn them on or
off: `isSolanaTransfersEnabled()` in `src/util/releaseFeatures.ts` reads
`VUE_APP_ENABLE_SOLANA_TRANSFERS` and treats everything except an explicit
`false` as enabled, and the 3.0.x build configuration does not define that
variable, so a release build is always enabled. (Bitcoin and Taira sends keep
their evidence-manifest gating; this kill switch does not touch them.)

The remote config (`appConfigs/web_config.json`, fetched from
`shared-features-utils`) can only **veto** the Solana send. It can never enable
a send the build compiled off.

| Remote value                         | Effect                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| key absent                           | keeps whatever is remembered; with nothing remembered, enabled |
| `false`                              | veto: send hidden in the UI and refused by the background      |
| `true`                               | lifts a remembered veto (never enables a compiled-off send)    |
| non-boolean, malformed, fetch failed | ignored; the remembered state is kept                          |

Vetoes are sticky: the background remembers them in `chrome.storage`
(`sendKillSwitch`) and the popup in `localStorage`
(`feature_send-kill-switch-v1`), so an offline start keeps a veto. Only a later
successful fetch with an explicit `true` lifts it. A send that arrives while a
cold-started service worker is still fetching waits for the remembered state.

The key is read from `actions`, `actionCapabilities` or `feature_toggle`.
`solanaSend` and the mobile apps' `solana_send_enabled` mean the same thing; a
`false` in any of them is a veto. The veto also refuses a dApp's
`signAndSendTransaction`; sign-only dApp requests are unaffected.

## Emergency veto template (publish only in an emergency)

The release does **not** need any remote change: an absent key means enabled.
Publish this only to stop Solana sends in an emergency, after release-owner
sign-off:

```json
{
  "actions": {
    "solanaSend": false
  }
}
```

Merge the block into the existing `web_config.json` rather than replacing the
file. To lift the veto later, publish an explicit `true`; removing the key
leaves the veto in place on every device that saw it.

The remote config is never the source of an RPC endpoint, a recipient, an
amount or any key material. This switch reads three boolean keys and nothing
else.
