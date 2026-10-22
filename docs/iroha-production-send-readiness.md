# Iroha send readiness (browser extension)

Taira testnet sends are built in the extension background and submitted
directly to Torii's REST API. The wallet does not use Torii's MCP endpoint.
SORA Nexus sends stay disabled: Nexus has no approved production endpoint or
pinned network identity, and `enabledByDefault` remains `false`.

The machine-readable state is `config/iroha-production-send-readiness.json`.
Production builds enable Iroha sends exactly when that manifest is `ready` and
`releaseEnabled` (`scripts/release-transfer-flags.mjs`); the environment cannot
override it.

## Transfer path

1. **Prepare.** The stored Iroha account, recipient, amount and asset are
   normalized; I105 literals must belong to the selected network and amounts
   must be canonical decimals.
2. **Check the node.** Before anything is signed, the wallet reads the genesis
   block (`/v1/explorer/blocks/1`) and `/v1/node/capabilities`. The genesis hash
   must equal the pinned Taira network ID, and the node must report the data
   model and signed-transaction schema the bundled codec encodes. A Taira reset
   or upgrade therefore stops sends with `iroha_network_reset` or
   `iroha_node_protocol_unsupported` until the wallet is updated.
3. **Price.** The fee is computed exactly from `root_fees_v1` in
   `/v1/parameters`: `base_fee + per_byte_fee × frame bytes + per_instruction_fee
   + per_gas_unit_fee × 180` (Iroha's fixed native transfer gas). On Taira that
   is 0.01 XOR. The signed fee cap equals this fee, so the user authorizes
   exactly what they are shown. The amount must not exceed the asset's scale,
   and the account must hold the amount plus the fee.
4. **Encode and sign.** `@iroha/iroha-js/transaction-codec` (vendored 0.0.3)
   builds the canonical payload. The key is derived locally from the mnemonic
   (`m/44'/617'/0'/0'`), signs the payload hash with Ed25519, and the SDK
   verifies the signature and authority before producing versioned bytes. The
   SDK's native import resolves to `src/util/irohaSdkBrowserBinding.ts`, which
   supplies only I105 parsing and rendering from the wallet's address codec; all
   other native operations fail closed.
5. **Submit.** `POST /v1/pipeline/transactions` sends the exact signed bytes
   once. The receipt hash must match. The wallet then polls
   `/v1/pipeline/transactions/status` until the transaction is state-resolved
   `Applied`, reporting `Rejected` and `Expired` outcomes. A timeout or dropped
   connection after submission is reconciled by status only; it is never
   resubmitted or re-signed. Transactions live for 60 seconds and the wallet
   waits up to 90; if no final status arrives, it reports the outcome as
   unknown with the transaction hash instead of a failure.

## Evidence and release gate

Live evidence comes from the extension's own transfer path:

```sh
FEARLESS_TAIRA_LIVE=1 FEARLESS_TAIRA_MNEMONIC="..." FEARLESS_TAIRA_RECIPIENT="testu..." \
FEARLESS_TAIRA_EVIDENCE_OUT=build/reports/taira-transfer-evidence.json yarn test:smoke:taira
```

Use a funded, testnet-only account (Taira's faucet provides XOR). Record the
output, the producing commit and the operator under `evidence` in the manifest.

`bash scripts/audit-iroha-production-send-readiness.sh` (offline, CI) checks:

- the vendored SDK archive's size and SHA-256 and the `package.json` pin;
- the pinned Taira network ID, Torii URL and wire constants in
  `src/consts/universalWallet.ts`;
- that the production codec imports the vendored transaction codec and the
  build routes its native import to the wallet binding;
- that no wallet source calls Torii MCP or reintroduces a global native seam;
- that Nexus stays disabled; and
- that every evidence entry was recorded on the pinned genesis within the last
  30 days, by a commit that is an ancestor of the audited one, with no changes
  since then to the transfer-path files listed in the manifest. Changing any of
  them requires fresh evidence.

`--require-ready --live` (run by `yarn prepare:chrome-release` when Iroha sends
are enabled) also confirms on Taira that the genesis and wire format still
match and that each evidence transaction is state-resolved `Applied`.
`bash scripts/test-iroha-production-send-readiness-audit.sh` exercises the gate
against tampered and stale fixtures.

## After a Taira reset

1. Read the new genesis hash from `/v1/explorer/blocks/1` and update
   `networkId` in `src/consts/universalWallet.ts` and the manifest.
2. Confirm `/v1/node/capabilities` still matches the manifest `wire` section;
   if not, vendor an SDK release that encodes the new format.
3. Fund a test account from the faucet, run the live smoke, and replace the
   manifest evidence.
