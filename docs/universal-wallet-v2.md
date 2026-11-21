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

The browser wallet is the wallet side of the current Iroha Connect v1 protocol,
the one Torii relays on Taira and that `@iroha/iroha-js/connect-browser` and
`@iroha/connect-widget` speak on the app side. It lives under **Settings →
IrohaConnect** and ships enabled; a build with
`VUE_APP_ENABLE_IROHA_CONNECT=false` compiles it off as a kill switch.

### Links

The dApp registers its session with Torii (`POST /v1/connect/session`) and shows
the returned wallet link, as `iroha://connect` or `irohaconnect://connect`. The
link must carry exactly `sid`, `network_id`, `app_pk`, `nonce`, `node`, `v=1`,
`role=wallet`, `token` and `relay`. The wallet accepts it only when:

- `network_id` is the exact checksummed NetworkId pinned for a supported network
  and `node` is that network's own Torii root;
- `sid` equals blake2b-256(`iroha-connect|sid|` || NetworkId || `app_pk` ||
  `nonce`), so the session is bound to the network and the app key;
- every token and key is canonical unpadded base64url.

| Network | NetworkId                                                                   | Torii root                  |
| ------- | --------------------------------------------------------------------------- | --------------------------- |
| Taira   | `hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774` | `https://taira.sora.org`    |
| Nexus   | not pinned yet: Nexus links are refused                                      | `https://minamoto.sora.org` |

The retired Uranai link (`chain_id` instead of `network_id`, no `relay`, a
plaintext "ciphertext" slot) is refused with its own message: Torii no longer
relays it.

### Session

The background service owns the WebSocket
(`wss://<torii>/v1/connect/ws?sid=…&role=wallet`, token in the
`iroha-connect.token.v1.*` subprotocol), so closing the popup never approves,
signs or silently drops a request. It waits for the dApp's Open frame, checks
that its app key and NetworkId match the link, and shows the app name and HTTPS
origin, network, relay and requested permissions next to the account choice.

Approval signs the tagged approval preimage (domain, NetworkId, constraints
hash, sid, app key, wallet key, account, permissions hash when present, relay
auth hash) with the account's Ed25519 key. The app SDK verifies it against the
I105 account before deriving keys. Both sides then derive direction keys from an
ephemeral X25519 exchange (HKDF-SHA256, sid-salted). Every later request and
answer is a ChaCha20-Poly1305 envelope in a Norito `EnvelopeV1` frame, bound to
the sid, direction and sequence number. Frames must arrive in strict sequence.
Replays, gaps, foreign sids and frames that do not authenticate close the
session.

During review and approved sessions the background sends a sequenced Connect
Ping every 20 seconds, which the dApp SDK answers with a Pong. That traffic keeps
the Chrome 116+ extension worker alive. Torii closes a Connect socket on any
text frame, so the wallet never sends one. Pings from the dApp get a matching
Pong.

### Transactions

A `SignRequestTx` carries an unsigned transaction payload. Before anything is
shown, the wallet decodes every signature-bound field: NetworkId, authority,
creation time, TTL, nonce, fee payer and charge limits, gas limit, metadata, and
the executable. It then rebuilds the payload with the vendored SDK builders and
requires the identical bytes. The authority must be the connected account and
the NetworkId the session's network. The review shows:

- an asset transfer: amount and asset, destination, maximum fee and payer;
- contract calls: entrypoint, contract address, argument size and SHA-256, and
  code hash;
- the TTL, any metadata, and (under technical details) the payload hash to sign.

Payloads the browser codec cannot rebuild are refused with
`UNSUPPORTED_TRANSACTION` and never signed. That covers instructions that need
the SDK's native decoder, proof attachments and multi-instruction lists. Wrong
accounts, wrong networks and malformed payloads get `WRONG_ACCOUNT`,
`WRONG_NETWORK` or `INVALID_TRANSACTION`. Approval signs the marked Blake2b-256
payload hash with the account key, exactly as the wallet's own transfers do.
Each request is held for at most 120 seconds. Rejection (`USER_REJECTED`),
expiry (`REQUEST_EXPIRED`), a second request while one is open
(`REQUEST_IN_FLIGHT`) and an Open that did not ask for `sign_transaction`
(`PERMISSION_DENIED`) all fail closed. The wallet tells the person when it
declined a request on its own.

### Raw requests

`SignRequestRaw` is signed only by an account's registered off-chain signing
key, inside the off-chain envelope (`specs/account_signing_keys.md` upstream), so
a dApp can never obtain a transaction signature through a raw request. No SDK
can register such a key yet. Fearless therefore answers every raw request with
`SIGNING_KEY_REQUIRED` and never signs raw bytes with the account key.

The UI and private extension messages receive only a bounded public snapshot.
Relay tokens, session keys, ephemeral private keys, mnemonic material and payload
bytes never enter it. Sessions and pending approvals are not persisted; a
background restart needs a fresh pairing and never restores a signing grant.
`tests/smoke/iroha-connect-taira.spec.ts` (`FEARLESS_IROHA_CONNECT_LIVE=1`)
pairs with the live Taira relay through the upstream app SDK.

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

### Wallet password

A wallet created or imported with a password (`///password` in its Substrate
derivation path, or, when that path has none, in its Ethereum path) derives
Bitcoin, Solana, TON and Taira/Nexus from the words with that password as the
BIP39 passphrase (NFKD-normalised, as BIP39 specifies). Paths, curves and address
formats stay as above; without a password the accounts are exactly the ones every
earlier version derived. Owner decision of 2026-10-31 (design A):

- A newly created wallet gets only password-protected accounts.
- An import checks, read-only, whether each address the words alone open holds
  funds, as the TON chooser does. A funded address, or one that could not be
  checked, stays the wallet's account for that network; the others are protected.
  Networks a password wallet gains later follow the same rule.
- An address a wallet already shows is never replaced automatically. Signing
  follows the stored address: the password opens protected accounts and the words
  alone open the rest.
- A wallet with such old addresses gets one notice listing them with their
  protected addresses. Switch replaces only those a lookup confirms empty.
- An old address the wallet moved away from (Switch, or an import or later
  network that found it empty) stays watched, because funds can still arrive there:
  it is looked at again on every unlock and when the wallet's screen opens. If it
  holds funds and the protected account is confirmed empty, it becomes the wallet's
  account again; otherwise the protected account stays and the notice reports the
  funds at the old address.
- The background keeps the password sealed in the account metadata
  (`universalWalletPassphrase`, XSalsa20-Poly1305 under an HKDF key of the
  account's own secret, so the recovery words alone cannot open it). Wallets saved
  before this version kept no password: when their key shows a derivation path,
  the notice asks for the path once and keeps its password only if the path
  reproduces the stored key.

#### JSON and Google Drive restores

A JSON backup (the file Export → JSON saves, and the file a Google Drive backup
holds) carries the key and the words it came from, but not the derivation path.
When the words alone do not reproduce the key, the restored wallet is
`isMnemonicUnverified`: it signs with its key and shows no Bitcoin, Solana, TON or
Taira account. An Ethereum key at the standard path (`m/44'/60'/0'/0/0`, which
Fearless makes every Ethereum key at) needs no asking and counts as verified,
including keys earlier 4.x restores left unverified, at the next unlock.

- The restore asks once for the derivation path, in the JSON import step and in
  the Google Drive row (Skip leaves the wallet as it is). Wallet details offer it
  again ("Show Bitcoin, Solana, TON and Taira"); on a wallet that is not
  recovery-only the notice also asks once by itself.
- The words with the typed path must reproduce the stored key. Only then is the
  phrase verified and the wallet's accounts added, by the import rule above: with
  a password, each address the words alone open is checked first, and a funded or
  unchecked one stays while the others are protected and their old addresses
  watched; without one, every account is the one earlier versions showed. The
  wallet's linked Ethereum key gets the same accounts, and gains none of its own
  while the wallet waits for its path.
- The restore tests start from backups real 3.0.6 and 4.2.2 builds wrote, and
  from 4.2.2's own restore of them (`tests/fixtures/upgrade/json-backups`).

Vectors: `docs/universal-wallet-v2-passphrase-vectors.json`, generated by
`scripts/generate-universal-wallet-passphrase-vectors.py` (Python standard library
only; `--check-v2` reproduces the v2 fixture). The same file is byte-identical in
the iOS and Android repositories.

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

`docs/universal-wallet-v2-passphrase-vectors.json` adds the same phrases with a
password (one that NFKD rewrites) and the derivation paths that do and do not
carry one; every repo derives its expected addresses with the passphrase.
