# WalletConnect in Fearless

Fearless speaks WalletConnect v2 with its own client, in
`src/extension/background/extension-base/src/services/wallet-connect-service/protocol/`. It replaced the WalletConnect
SDK (`@walletconnect/sign-client`, `core`, `utils`, `types` and `universal-provider`), which is under the WalletConnect
Community License and is not open source, together with the small `@walletconnect` JSON-RPC and encoding helpers. No
`@walletconnect` package is a dependency of this repository.

The client plays both of Fearless's roles with one relay connection and one stored record:

- the wallet that dApps pair with: proposals, approval and refusal, signing requests, ping and disconnection;
- the dApp that pairs with a phone wallet for mobile accounts: proposal, settlement, requests, and the phone's updates,
  extensions and disconnection.

A session in which Fearless is the controller is a wallet session. The client refuses signing requests in any other
session, and namespace updates or extensions from a peer that is not the controller.

A wallet session lists, for each namespace, only the methods Fearless answers there (`walletConnectNamespaceMethods`
in `consts.ts`), plus any method a dApp still sends as required, which its SDK needs in the session. A dApp's provider
sends the wallet every method the session lists and answers the others itself or from its node, so an optional method
Fearless cannot answer stays out: AppKit dApps ask for 24 EVM methods, among them `wallet_getCapabilities`,
`wallet_watchAsset` and `eth_sendRawTransaction`. The approval screen still warns about every requested method the
wallet does not answer.

## Files

| File | What it does |
| --- | --- |
| `crypto.ts` | X25519 key agreement, HKDF-SHA256 session keys, SHA-256 topics, ChaCha20-Poly1305 envelopes (type 0; type 1 is read, never opened), the relay's EdDSA sign-in token |
| `relay.ts` | The relay over a WebSocket: subscribe, publish, acknowledge deliveries, fetch held messages, reconnect |
| `client.ts` | Pairing, proposals, sessions and requests for both roles, expiry, events |
| `validation.ts` | Reads what peers send; anything malformed or oversized is refused |
| `verify.ts` | The Verify service: a signed (ES256) attestation of the dApp's origin, or the service's answer by message hash |
| `store.ts` | The one stored record, and the import of SDK 2.x records |
| `uri.ts`, `errors.ts`, `types.ts` | Pairing links, the protocol's error codes, and its message shapes |

The cryptography uses `@noble/curves`, `@noble/hashes`, `@noble/ciphers` and `@scure/base` (MIT), which the wallet
already uses for keys.

## On the wire

The client follows the published protocol: relay methods `irn_subscribe`, `irn_batchSubscribe`, `irn_publish`,
`irn_unsubscribe`, `irn_batchFetchMessages` and `irn_subscription`, each Sign method's relay tag and lifetime, padded
base64 envelopes, and the pairing link format. A test checks the relay sign-in token against the bytes WalletConnect's
own relay-auth produces for the same inputs. The session-key test uses the RFC 7748 X25519 keys.

The relay holds a message published to a topic nobody listens to, and gives it to the first client that subscribes.
That is how a proposal published before the wallet scans the link still reaches it. Each held message is delivered
once.

Not offered: one-click authentication (`wc_sessionAuthenticate`; dApps fall back to their proposal), link mode, and
push notifications.

## Storage and upgrades

The client opens after master-password unlock. The accounts store holds one `walletconnect:v2` envelope in extension
local storage or web IndexedDB. A random salt and scrypt (N=32768, r=8, p=1) derive its key. Each whole-record write
uses XChaCha20-Poly1305 with a new nonce and a format-specific authentication context. Password changes re-encrypt
the envelope in the same commit as the verifier. Lock leaves both relay roles listening: a request can prompt for
unlock and approval, but the relay key cannot unlock the wallet or authorize a signature. A wallet without a master
password cannot pair. Chrome keeps only the derived record key in trusted-context `chrome.storage.session` so an
MV3 worker can resume while locked. A browser restart (or extension reload/update) clears it; the first unlock
resumes WalletConnect. On web the key lives only in page memory, so a reload also requires unlock. Reset drops the
key; a successful password change drops the old key and resumes with the rotated envelope.

On first unlocked use the client preserves the v1 record, or imports the SDK 2.x sessions, pairings, keys and relay
identity. It decrypts and checks the persisted envelope before removing legacy records. Interrupted cleanup resumes
after authenticated readback. Downgrades do not restore old sessions; leaving a plaintext rollback copy would defeat
the protection. Removing database records is not secure disk erasure. Copies made before migration are not protected
retroactively. Re-pair if one may have been exposed.
SDK proposals and requests in flight are not imported. Expiries are reported on restart as before.

After a worker starts, the client waits two seconds before it reconnects to the relay and reports expiries. The
services attach their listeners after a storage read of their own, and must not miss a request the relay held while the
worker was stopped.

## Validation

- `tests/unit/wallet-connect-protocol.spec.ts` runs both roles against an in-memory relay that follows the live relay's
  delivery rules. It covers pairing before subscription, approval, refusal, requests, redelivery, role refusals,
  forged settlements, expiry, restarts, the SDK 2.x import, Verify and reconnection.
- `scripts/walletconnect-pairing-smoke.mjs` and `scripts/walletconnect-dual-role-smoke.mjs` drive the built extension in
  Chrome against the live relay. The peer is the in-repo client (`scripts/walletconnect-peer.mjs`). With
  `WALLETCONNECT_REFERENCE_SDK` set to a directory outside this repository where `@walletconnect/sign-client` and
  `@walletconnect/utils` are installed, the peer is the SDK most dApps ship instead. That checks Fearless against what
  real dApps and phone wallets run, without making the SDK part of this repository.
