# Bitcoin Restore Discovery

Fearless Bitcoin support is scoped to BIP84 native SegWit wallets. Restore and
manual rescan flows discover receive addresses only under account `0`:

| Network | Account path | Receive path template |
| --- | --- | --- |
| Mainnet | `m/84'/0'/0'` | `m/84'/0'/0'/0/{index}` |
| Testnet | `m/84'/1'/0'` | `m/84'/1'/0'/0/{index}` |

## Scan Behavior

Wallet clients must scan receive addresses from index `0` upward and query the
configured Esplora-compatible Bitcoin indexer for each derived address. An
address is treated as used when the indexer reports at least one confirmed or
mempool transaction.

The default restore gap limit comes from the shared Universal Wallet registry:
`UNIVERSAL_WALLET_BITCOIN_NETWORKS[network].defaultGapLimit`. The current value
is `20` for both mainnet and testnet. Callers may pass an explicit `gapLimit`
only for recovery, support, or test tooling.

The scan stops after observing `gapLimit` consecutive unused receive addresses.
The next receive address is always `lastUsedIndex + 1`, or index `0` for an empty
wallet. The returned `nextReceivePath` must be persisted with the next receive
index so repeated rescans are deterministic.

## Safety Limits

Runtime callers should keep `maxLookahead` at the default `1,000` unless a user
is in an explicit recovery flow. The discovery helper rejects:

- blank mnemonics;
- gap limits below `1` or above `100`;
- lookahead values below the gap limit;
- lookahead values above `10,000`;
- impossible transaction counts from malformed indexer responses.

If the helper raises `bitcoin_discovery_lookahead_exhausted`, clients must not
commit partial discovery state as final. The recovery UI can offer an advanced
rescan with a larger lookahead or ask the user to verify that the selected
network and mnemonic are correct.

## Privacy And Reliability

Discovery is address-by-address and read-only. Public wallet builds must use the
registry-configured public Bitcoin indexer defaults unless the user explicitly
selects a local or custom indexer. Restore and rescan flows should run in the
background, surface indexer failures without hiding previously discovered
balances, and never log mnemonics, seeds, private keys, or full discovery state.
