# Universal Wallet V2 Contract

Status: implementation contract for the Bitcoin, Solana, TON, and SORA Nexus
workstreams.

## Goals

- New wallets are one encrypted universal wallet, not one wallet per ecosystem.
- The default backup phrase for newly created wallets is 24 BIP39 words.
- Import remains compatible with 12-word BIP39 phrases.
- One phrase deterministically restores every supported account on Android, iOS,
  and the browser extension.
- Legacy accounts remain available only for export and fund-safety recovery after
  the migration cutoff.
- Wallet core, chain registry defaults, derivation rules, and indexer clients
  stay open source.

## Ecosystems

The shared ecosystem enum is lowercase at API, registry, and fixture boundaries:

- `substrate`
- `evm`
- `ton`
- `bitcoin`
- `solana`
- `iroha`

Platform UI may map these values to native enum names, but persisted and networked
interfaces must use the lowercase identifiers above.

## Identity Envelope

Wallet metadata uses a versioned JSON envelope with these fields:

| Field                    | Requirement                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `schemaVersion`          | Must be `2`.                                                                                   |
| `walletId`               | Stable local id matching `uw2_[A-Za-z0-9_-]{16,64}`.                                           |
| `displayName`            | Non-empty user-visible name, at most 64 characters, no control characters.                     |
| `source`                 | One of `created-24-word`, `imported-12-word`, `imported-24-word`, `legacy-import`.             |
| `status`                 | One of `active`, `migration-required`, `legacy-export-only`.                                   |
| `publicAccounts`         | Public account descriptors only; no mnemonic, seed, private key, or encrypted secret material. |
| `createdAtMillis`        | Positive Unix epoch timestamp in milliseconds.                                                 |
| `updatedAtMillis`        | Optional Unix epoch timestamp in milliseconds, greater than or equal to `createdAtMillis`.     |
| `legacyExportOnlyReason` | Required only for `legacy-export-only`; otherwise must be absent or blank.                     |

An `active` identity must include at least one public account for every supported
ecosystem: `substrate`, `evm`, `ton`, `bitcoin`, `solana`, and `iroha`.
`migration-required` identities may be partial but must contain at least one
public account. `legacy-export-only` identities must use `source =
legacy-import` and include a short human-readable recovery/export reason.

Public account descriptors use lowercase ecosystem ids, stable account ids
matching `^[a-z0-9][a-z0-9._:-]{1,63}$`, chain ids matching
`^[A-Za-z0-9._:-]{2,128}$` when present, derivation paths rooted at `m`, and
lowercase hex public keys when present.

## Signing Contract

Wallet signing prompts use a shared request/result envelope. Requests contain
`requestId`, `accountId`, `ecosystem`, `chainId`, `origin`, `method`,
chain-specific payload fields, `createdAtMillis`, and optional
`expiresAtMillis`.

Allowed methods are `sign-message`, `sign-transaction`,
`sign-and-send-transaction`, and `sign-all-transactions`. Message payloads use
`base64`, `hex`, or `utf8` encoding plus a display hint of `raw`, `utf8`, or
`hex`. Single transaction methods carry `transactionBase64`. Batch signing
carries `transactionsBase64` with at most 16 transactions.

Results contain the request identity fields, method, `status`, signing outputs,
optional `errorCode`, and `signedAtMillis`. Allowed statuses are `approved`,
`rejected`, and `failed`. Approved message results must include a public key and
at least one signature representation. Approved transaction results must include
the signed transaction payload. Approved sign-and-send results must also include
a transaction hash. Rejected and failed results must include an error code and
must not include signatures or signed payloads.

Clients must reject malformed request ids, account ids, ecosystems, chain ids,
origins, timestamps, invalid base64/hex payloads, oversized transaction batches,
and result payloads that do not match their status and method.

## IrohaConnect Wallet Relay

The browser wallet exposes a wallet-side IrohaConnect flow under **Settings →
IrohaConnect** for SORA Nexus and Taira. It accepts the deployed
Uranai-compatible v1 wallet URI in either `iroha://connect` or
`irohaconnect://connect` form. The URI must contain exactly `sid`, `chain_id`,
`node`, `v`, `role`, and `token`; the chain id and Torii root must match one of
the canonical profiles below.

| Network | Chain id                               | Torii root                  |
| ------- | -------------------------------------- | --------------------------- |
| Taira   | `fc56984b-2be7-431d-840e-21514d1883f0` | `https://taira.sora.org`    |
| Nexus   | `sora:nexus:global`                    | `https://minamoto.sora.org` |

The background service owns the authenticated WebSocket so closing the popup
does not approve, sign, or silently discard a live request. The visible UI and
private extension messages receive only a bounded public snapshot: app name and
HTTPS origin, canonical network, public account descriptors, and a summarized
contract request. Relay tokens, ephemeral private keys, mnemonic material, and
raw signing bytes never enter the UI snapshot.

An incoming contract signature request opens or focuses the dedicated
IrohaConnect review route, contributes to the shared approval badge, and keeps
that route as the post-unlock destination when the keyring is locked. Stale
notification windows are discarded and recreated at the review route; a popup
failure does not alter or implicitly approve the protocol request.

During session review and approved sessions, the background sends the text
frame `keepalive` every 20 seconds for Chrome 116+ extension-service-worker
liveness. Torii ignores text frames, so this does not create an IrohaConnect
message, consume a protocol sequence number, or require the dApp to answer a
Ping. Protocol Ping controls received from the dApp are still answered with a
matching Pong.

Connection approval signs the IrohaConnect approval preimage with the selected
Iroha Ed25519 key. A connection does not authorize unattended signing. Each
`uranai.irohaconnect.contract-call-signature.v1` request is checked against the
approved I105 account, capped, held for at most 90 seconds, and shown for a
separate user decision with the exact byte length and SHA-256 digest. Approval
signs the exact decoded bytes; rejection, expiry, account mismatch, concurrent
requests, replayed sequence numbers, and socket teardown fail closed. Key
material is derived only inside the background keyring boundary and temporary
byte arrays are cleared after use.
Sessions and pending approvals are intentionally not persisted; a background
restart requires a fresh dApp pairing and never restores a signing grant.

Uranai's optional private-trade-proof extension is not a generic signature and
requires a dedicated proof system. This wallet responds with the protocol-level
`unsupported_private_proof` rejection instead of fabricating or auto-signing a
proof. Public Uranai contract calls use the supported per-request signature
flow.

## Legacy upgrade continuity

The October 2026 browser-extension security update supersedes normal-use
continuity for existing local secret-bearing wallets. Those wallets retain
balance viewing, backup export, transfers out, unstaking, redeeming, safe reward
claims and supported DeFi withdrawals, but cannot deposit, swap, add stake,
authorize dApps or sign arbitrary requests. A fresh root generated by the updated
extension is required for normal use. See
[wallet security recovery mode](wallet-security-recovery-mode.md).

The following earlier continuity rules still describe account inventory and
web-client compatibility; they do not override extension recovery restrictions.
The 6 September 2026 upgrade requirement superseded the hard-cutoff policy.
Existing wallets retain balance, transfer, staking, dApp, signing and export
access without having a complete Universal Wallet V2 identity. Missing network
metadata must not send an existing installation to wallet creation. A fresh
install with no accounts enters `create-universal-wallet`. The historical
`migrate-before-access` value is accepted as normal legacy access for compatibility.

Legacy vault descriptors describe export operations and keep their existing wire
format: `canExportSecrets = true`, `canSignTransactions = false`, and
`mode = export-only`. They are not account permissions. Existing account signers
and normal account selection remain available through their original keyring
identities. Account passwords and ordinary signing authorization still apply.

The older per-account-password migration validates linked credentials before
reencryption, retains pending EVM children after interruption, and retries each
remaining pair. It never deletes an account as a way of skipping migration.
Temporary inventory or worker failures leave account data and entered passwords
available for retry.

Migration snapshots contain `schemaVersion`, `platform`, `hasUniversalWallet`,
`legacyVaults`, `cutoffAtMillis`, and `evaluatedAtMillis`. Clients must reject
duplicate legacy vault ids, malformed account ids, unknown ecosystems, unsafe
addresses or display names, missing export-only reasons, disabled export, legacy
signing flags, and invalid timestamps.

## Secure-Storage Migration Requirements

Android migration must read old account material only through the existing
encrypted stores, write Universal Wallet V2 material through Android Keystore
backed encryption where available, preserve export-only legacy descriptors, and
never copy mnemonic, seed, or private-key material into public logs, analytics,
plain preferences, or repo fixtures.

iOS migration must read old account material only through Keychain-backed
storage, write Universal Wallet V2 material to the configured Keychain access
group with passcode or biometric protection where available, preserve export-only
legacy descriptors, and avoid storing secret material in Core Data, user defaults,
logs, or public fixtures.

Web extension migration must read old account material through the extension
keyring, write Universal Wallet V2 material only through the encrypted keyring or
WebCrypto-protected browser storage, preserve export-only legacy descriptors, and
avoid storing secret material in unencrypted local storage, background messages,
Redux/Pinia state, logs, or test fixtures.

## Derivation Defaults

| Ecosystem        | Default                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Substrate/DOT    | Existing sr25519 root derivation; SS58 prefix is chain-specific.        |
| EVM              | `m/44'/60'/0'/0/0`                                                      |
| Bitcoin mainnet  | BIP84 account path `m/84'/0'/0'`; first receive path `m/84'/0'/0'/0/0`. |
| Bitcoin testnet  | BIP84 account path `m/84'/1'/0'`; first receive path `m/84'/1'/0'/0/0`. |
| Solana           | `m/44'/501'/0'/0'`                                                      |
| TON              | `m/44'/607'/0'/0'/0'`, Wallet V4 R2, workchain `0`.                     |
| SORA Nexus/Iroha | `m/44'/617'/0'/0'`, Ed25519 I105 account address.                       |

Solana import compatibility may support common existing Solana paths, but new
Universal Wallet V2 accounts must use `m/44'/501'/0'/0'`.

TON import compatibility: importing a phrase as a TON wallet accepts BIP39 and
native TON phrases and offers every address the text can open, so a wallet from
an earlier Fearless version is restored where its TON is:

- `universal`: the TON path above (BIP39 phrases only);
- `native`: TON's own key derivation for phrases that pass TON's check;
- `fearless-legacy`: that derivation over a BIP39 phrase, as Fearless 3.0.1-3.0.5
  for Chrome and the Android app derived every TON account;
- `as-typed`: that derivation over the text exactly as typed, spacing and capitals
  included, offered when the text differs from the tidied phrase (the Android
  app stored TON phrases verbatim). The text is stored and exported verbatim,
  with a warning on export.

When more than one address is offered, the import screen looks them up
read-only, preselects the only one in use (otherwise the first) and says when it
could not check. The pick is recorded as `meta.tonDerivation`; signing and export
always follow the stored public key. An address that is already in the wallet is
never overwritten; a stored phrase that no longer opens with the current
password is repaired from the typed one. Fixtures:
`tests/fixtures/ton/ton-{bip39,native}-3.0.5-vectors.json` (3.0.5 libraries) and
`tests/fixtures/ton/ton-android-4.2.0-vectors.json` (shipped Android 4.2.0).

Bitcoin restore and manual rescan behavior is defined in
`docs/bitcoin-restore-discovery.md`. Clients must use the shared registry gap
limit by default and treat confirmed or mempool transaction activity as address
usage.

## Registry Requirements

Registry files use `schemaVersion = 1` and a top-level `chains` array. Each
chain entry contains `id`, lowercase `ecosystem`, `chainId`, `displayName`,
`enabledByDefault`, optional `nativeAsset`, optional `derivationPath`, optional
`slip44CoinType`, and `endpoints`.

Enabled-by-default chains must include at least one endpoint. Disabled or gated
chains, including Nexus before its production Torii/TLS endpoint is confirmed,
may omit endpoints. Chain ids and endpoint ids must be unique, display names
must be non-empty human-readable strings without control characters, native asset
symbols must be uppercase, decimals must be in `0...255`, and derivation paths
must be rooted at `m`.

Endpoint kinds are `indexer`, `rpc`, `torii`, `torii-mcp`, and `explorer`.
`torii` is a Torii REST base URL; the web wallet calls Torii directly and only
reads `torii-mcp` from older registries. Public URLs
must be HTTPS; local development URLs may use `http://localhost` or
`http://127.0.0.1`. Registry endpoint URLs must not embed credentials, query
parameters, or fragments. Public indexer endpoints are read-only. Broadcasts,
transaction simulation, and other write operations must use RPC or Torii
endpoints, never a public indexer endpoint.

- TON indexer base URL: `https://ti.soramitsu.io` (the TONSWAP indexer, "TI").
  The extension talks to TI only through TI's own routes
  (`/api/indexer/v1/service-info`, `accounts/{addr}/balance|state|txs`,
  `runGetMethod`, and `/api/v2/jsonRPC` `sendBoc`), never through a TonAPI
  client (`src/.../services/ton-provider`). TI is used for a TON network only
  after its service-info reports `chainId == "ton:<network>"`, and every
  balance, state and history response must again report that `network`;
  any other answer is rejected and never shown. TI broadcasts only when its
  service-info says `readOnly: false`. While TI is not verified (observed
  2026-10-10: it reports `testnet` and has no service-info route), the
  registry's TON node (`https://tonapi.io` in `chains/v13`) is used instead,
  after its masterchain head shows global id `-239` (`-3` for testnet). The
  fallback is logged every time it is chosen and is switched off with
  `UNIVERSAL_WALLET_TON_PROVIDER.registryNodeFallback` once TI serves TON
  mainnet. When neither provider is verified, TON balances show "Balance
  update failed" (the last confirmed balance if there is one, marked as out
  of date), never 0, in both portfolio lenses and on the asset page, and
  transfers fail before signing anything. TI lists only the jettons it
  indexes, so its jetton list never zeroes a jetton it does not mention, and
  its transactions carry no fee, so TI history shows no fee rather than 0.
  Remote config never chooses a TON host.
- Solana indexer base URL: `https://si.soramitsu.io`.
- `si.soramitsu.io` is read-only. Transaction simulation and broadcast use the
  configured Solana RPC endpoint directly.
- Taira testnet is enabled with I105 chain discriminant `369`, Torii root
  `https://taira.sora.org`, and chain id
  `fc56984b-2be7-431d-840e-21514d1883f0`. Transfers are signed for the pinned
  Taira network ID (the genesis block hash) and refused after a Taira reset
  until the wallet is updated.
- Nexus mainnet uses I105 chain discriminant `753` and chain id
  `sora:nexus:global`, but remains registry-gated until the
  production Torii/TLS endpoint is confirmed.
- Iroha `features: ['transfer']` is capability metadata. Browser sends are
  enabled only while `config/iroha-production-send-readiness.json` is ready
  with live Taira evidence; see `docs/iroha-production-send-readiness.md`.
  Nexus sends stay disabled.

### Nexus wallet-smoke transaction metadata

The operator-only Nexus wallet-smoke seam was removed with the earlier NexusApp
transfer codec. It required a Nexus chain identity the current data model no
longer signs against. It returns with Nexus enablement, once Nexus has an
approved Torii endpoint and a pinned network ID. Ordinary wallet transfers omit
transaction metadata.

## Normalized Indexer Contract

Wallet-facing indexer code maps raw chain responses into normalized public
payloads before UI, cache, or migration logic consumes them.

Normalized asset balances contain `accountId`, `ecosystem`, `chainId`,
`assetId`, raw integer `amount`, `decimals`, `isNative`, optional `symbol`,
optional `name`, optional `uiAmountString`, optional token or contract account
ids, and `syncedAtMillis`.

Normalized transactions contain `accountId`, `ecosystem`, `chainId`,
`transactionId`, `status`, `direction`, `operationType`, optional timestamp,
optional raw integer amount and fee fields, optional counterparty, optional block
number, optional cursor, optional HTTPS explorer URL, and `syncedAtMillis`.
Allowed transaction statuses are `pending`, `confirmed`, and `failed`. Allowed
directions are `incoming`, `outgoing`, `self`, and `unknown`. Allowed operation
types are `transfer`, `swap`, `stake`, `unstake`, `governance`,
`contract-call`, `mint`, `burn`, `fee`, and `unknown`.

Normalized token metadata contains `ecosystem`, `chainId`, `assetId`,
`decimals`, optional `symbol`, optional `name`, optional `iconUrl`, optional
`metadataUrl`, `isVerified`, and `syncedAtMillis`. Public asset URLs must be
HTTPS or IPFS URLs. Page metadata contains optional `nextCursor`, `limit`,
optional `total`, and `syncedAtMillis`; page limits are capped at `250`.

All normalized amounts are decimal strings containing unsigned raw integer
amounts. The clients must reject malformed account ids, unknown ecosystems,
malformed chain ids, unsafe cursors, invalid URLs, non-integer amounts, invalid
decimals, and non-positive sync timestamps before persisting normalized data.

## Fixture Contract

Golden vectors live in `docs/universal-wallet-v2-vectors.json`. Every wallet
repo must keep an equivalent fixture and test that:

- validates all six ecosystem sections are present;
- derives each expected public address from the mnemonic and path;
- rejects wrong Bitcoin purpose paths;
- rejects wrong Solana paths;
- rejects TON testnet-only addresses for mainnet receive flows;
- rejects Taira and Nexus I105 discriminants when used interchangeably.

The fixture intentionally contains a 12-word import vector and a non-zero
24-word default-wallet vector so test suites catch both compatibility and new
wallet creation regressions.
