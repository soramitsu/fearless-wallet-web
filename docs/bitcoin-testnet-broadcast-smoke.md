# Bitcoin Testnet Broadcast Smoke

The default smoke command uses an in-process Esplora-compatible fetch harness
and does not touch public Bitcoin testnet:

```sh
yarn test:smoke:bitcoin
```

To run a real testnet broadcast, fund the exact source outpoint and set every
required variable explicitly:

```sh
FEARLESS_BITCOIN_TESTNET_LIVE=1 \
FEARLESS_BITCOIN_TESTNET_MNEMONIC="..." \
FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS="tb1..." \
FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS="tb1..." \
FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT=1000 \
FEARLESS_BITCOIN_TESTNET_OUTPOINT="<txid>:<vout>" \
yarn test:smoke:bitcoin
```

Optional variables:

- `FEARLESS_BITCOIN_TESTNET_DERIVATION_PATH`: defaults to `m/84'/1'/0'/0/0`.
- `FEARLESS_BITCOIN_TESTNET_CHANGE_ADDRESS`: defaults to the source address.
- `FEARLESS_BITCOIN_TESTNET_FEE_RATE_SAT_VBYTE`: bypasses fee-estimate lookup.
- `FEARLESS_BITCOIN_TESTNET_INDEXER_URL`: defaults to
  `https://blockstream.info/testnet/api`.
- `FEARLESS_BITCOIN_TESTNET_INCLUDE_UNCONFIRMED=1`: allows the selected outpoint
  to be unconfirmed.

The live smoke refuses mainnet addresses, malformed outpoints, missing required
settings, and source addresses that do not match the supplied mnemonic and
derivation path before it creates the testnet client.
