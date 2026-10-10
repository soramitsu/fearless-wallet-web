# Bitcoin and Solana send kill switch

Bitcoin and Solana sends ship enabled in `4.2.0`. The release build sets
`VUE_APP_ENABLE_BITCOIN_TRANSFERS=true` and
`VUE_APP_ENABLE_SOLANA_TRANSFERS=true`, and the Chrome release audit requires
both values in `extension-build-metadata.json`.

The remote config (`appConfigs/web_config.json`, fetched from
`shared-features-utils`) can only **veto** a send. It can never enable a send
the build compiled off.

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

The keys are read from `actions`, `actionCapabilities` or `feature_toggle`.
`bitcoinSend` / `solanaSend` and the mobile apps' `bitcoin_send_enabled` /
`solana_send_enabled` mean the same thing; a `false` in any of them is a veto.
The Solana veto also refuses a dApp's `signAndSendTransaction`; sign-only dApp
requests are unaffected.

## Emergency veto template (do not publish unless there is an incident)

The release does **not** need any remote change: absent keys mean enabled.
Publish this only to stop sends during an incident, after release-owner
sign-off:

```json
{
  "actions": {
    "bitcoinSend": false,
    "solanaSend": false
  }
}
```

Merge the block into the existing `web_config.json` rather than replacing the
file, and veto only the affected chain. To lift the veto later, publish an
explicit `true` for that key; removing the key leaves the veto in place on
every device that saw it.
