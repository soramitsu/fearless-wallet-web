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

Release evidence is tracked in `scripts/bitcoin-testnet-broadcast-evidence.json`.
The default manifest remains blocked until a funded testnet broadcast succeeds.
Generate a fill-in-ready manifest template before recording the live result:

```sh
yarn test:bitcoin-broadcast-evidence-template
yarn generate:bitcoin-broadcast-evidence-template -- --output build/reports/bitcoin-broadcast-evidence-template.json
```

After a live run, record the broadcast txid, selected outpoint, source and
recipient testnet addresses, amount, indexer URL, UTC timestamp, operator, and
commit, then run:

```sh
yarn test:bitcoin-broadcast-evidence-template
yarn test:bitcoin-broadcast-evidence-audit
yarn audit:bitcoin-broadcast-evidence --require-ready
```
