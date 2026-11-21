# Bitcoin and Solana send kill switch

Bitcoin sends follow the audited live-network evidence manifest. Solana sends ship enabled.
The release build records both flags in `extension-build-metadata.json`; Bitcoin can only be
compiled on when its reviewed evidence is ready. Taira sends retain their separate evidence gate.

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

## dApp signing kill switch

The same rules (`src/util/remoteVeto.ts`) pause signing for dApps, one
network family at a time. The keys match the mobile apps':

| Family   | `actions` key         | `feature_toggle` key            | Pauses                                                          |
| -------- | --------------------- | ------------------------------- | --------------------------------------------------------------- |
| Polkadot | `polkadotDappSigning` | `polkadot_dapp_signing_enabled` | polkadot-js `signPayload`/`signRaw`, WalletConnect `polkadot_*` |
| EVM      | `evmDappSigning`      | `evm_dapp_signing_enabled`      | injected and WalletConnect `eth_*`, `personal_sign`             |
| Solana   | `solanaDappSigning`   | `solana_dapp_signing_enabled`   | every Solana provider request, sign-only ones included          |
| TON      | `tonDappSigning`      | `ton_dapp_signing_enabled`      | nothing yet: this build has no TonConnect                       |

The background checks the switch when the person approves a request, once the
phishing-list lookup has answered and before any key is used, a paired mobile
wallet is asked, or an external signature is delivered. A paused request ends as Reject ends it, so the dApp gets the usual
rejection, and the signing screen says that signing for the family is paused
and offers only Reject. Connecting and reading accounts keep working. The
background remembers pauses in `chrome.storage` (`dappSigningKillSwitch`), the
popup in `localStorage` (`feature_dapp-signing-kill-switch-v1`).

Never use a key named `dapp_enabled`: production configs already hold it as
`false`, and reading it would pause every family at once.

## Local runner lifecycle — 2026-10-12

The local-chain runner now owns daemon processes from the moment they are spawned, before waiting for readiness. A missing binary or early exit fails promptly; startup failures and SIGINT/SIGTERM shut down owned processes before removing their run directory. Startup RPC waits are bounded, and a process that ignores TERM is killed and reaped. This changes the test harness only.

Four process-lifecycle tests pass (`yarn test:local-chain-processes`), an actual runner interruption during daemon startup returns 143 with no surviving owned process or run directory, and all 17 private Bitcoin-regtest/Solana-validator send tests pass without skips or failures. Source and evidence hashes are in `docs/release/local-chain-runner-validation.json`. Packaged extension and distribution qualification remain separate gates.

The standalone Node lifecycle tests are named `scripts/local-chains/test-process-lifecycle.mjs` so Vitest does not try to collect them as application tests. The `test:local-chain-processes` command remains the gate for those four subprocess tests; the earlier source manifest keeps its historical filename.
