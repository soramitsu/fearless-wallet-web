# Fearless `@emurgo/cardano-serialization-lib-browser` stub

Fearless Wallet has no Cardano accounts, but `@subwallet/keyring` 0.1.14 imports the Cardano serialization and
message-signing libraries when it loads, for its `cardano` pair type only. That put about 3 MB of Emurgo WebAssembly
and its JavaScript glue into the extension worker that holds every decrypted key, and instantiated it at every
start. This private, dependency-free package replaces `@emurgo/cardano-serialization-lib-browser` 15.0.3 through an exact `resolutions` entry.

- Reading an export never throws, so the keyring's modules still load. The constructors
  `utils/cardano/coseKey.js` calls at load time (`Label.new_text`, `Label.new_int`, `Int.new_i32`) return an inert
  value.
- Every other Cardano operation throws. The keyring's address checks (`isCardanoAddress` and friends) catch that
  and answer "not Cardano", so Substrate, EVM, Bitcoin and TON addresses decode as before. A Cardano address is
  refused, and a `cardano` pair cannot be created or loaded. Fearless never created one, and its JSON import accepts
  only sr25519, ed25519, ecdsa and ethereum keys.

`scripts/test-crypto-dependency-shims.mjs` checks the resolutions, manifests and behaviour, and
`tests/unit/cardano-keyring.spec.ts` checks the keyring with these stubs. Restore the upstream package only together
with Cardano support and a review of what it adds to the key-holding worker.
