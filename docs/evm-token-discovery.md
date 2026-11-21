# Finding ERC-20 tokens outside the registry

The registry lists 107 assets on its 19 EVM networks, and the wallet used to read only those, one `balanceOf` per
token. Thousands of other ERC-20 tokens exist. A wallet holding one of them saw nothing, and could not add it by hand
either. This page compares two ways to find them, says which one the wallet uses, and gives its rules. When balances
are read in general is in `docs/balance-freshness.md`.

## Two ways to find them

**A. Token lists and Multicall3 on the wallet's own nodes.** A script builds a list of known tokens for each network
from public token lists. The lists are kept in `remote-config/` beside `chains.json`. The wallet reads the balance of
every listed token in a few calls through Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`). The calls go to the
same nodes that already read the wallet's registry balances.

**B. An indexer API such as Blockscout.** The wallet asks an explorer for every token an address holds.

| | A. Lists and Multicall3 | B. Indexer API |
| --- | --- | --- |
| Who learns the wallet's address | The networks' own nodes, which read its registry balances already | A new operator for each network, which can link the wallet's addresses on every network to its IP address |
| New hosts in the bundle | None. Lists come from `raw.githubusercontent.com`, as `chains.json` does, and carry no address. | One or more per network: the bundle-host audit, the Chrome release audit and `docs/browser-extension-privacy.md` change |
| Coverage | Tokens on the lists: 5,048 on 9 networks today | Every token the indexer has seen, spam included |
| Networks | All 11 production networks with Multicall3 (checked with `eth_getCode`); lists for 9 of them | Blockscout has no public instance for BNB Smart Chain, Avalanche C-Chain, Kaia, X Layer or Viction |
| Spam and fake tokens | Only tokens on curated lists, checked on chain by the script | Airdropped scam tokens show up and must be filtered |
| Rate limits and uptime | A few calls per network a day, one per poll for found tokens | Public explorer limits, no service promise, API changes |
| Licences | The lists are MIT; no library is added (ethers encodes the calls) | Blockscout is open source, but the wallet depends on a hosted service |

**The wallet uses A.** It finds the tokens people actually hold without telling anyone new where the wallet's money
is, and it adds no host. B would find more, but most of what only B finds is spam, and it would hand every wallet's
address on every network to new operators. A token on no list stays invisible with A; adding list sources is a change
to the script's sources.

Because A adds no host and sends no new data to anyone, `docs/browser-extension-privacy.md` is unchanged: it already
says the extension contacts RPC nodes for balances and reads network configuration. `scripts/audit-bundle-hosts.mjs`
passes on the production build unchanged.

## The lists

- `scripts/generate-evm-token-lists.mjs` builds `remote-config/production/tokens/evm/v1/<chainId>.json` and
  `index.json` from the sources in `scripts/evm-token-list-sources.json`. Each source is MIT-licensed and pinned to a
  commit: SmolDapp, Trust Wallet, the Superchain list, Balancer, SushiSwap and PancakeSwap. CoinGecko and CoinMarketCap
  lists are not used, because their terms are not an open licence. `--check` regenerates in memory and reports files
  that differ; two runs on 2026-11-13 gave identical bytes.
- A token is kept only if it answers `decimals()` and `balanceOf(address)` on chain. The script reads both through
  Multicall3 on the registry's own node, and the chain's decimals replace the lists'. A token whose `balanceOf`
  reports a funded address's native balance mirrors the native coin and is dropped. OP Mainnet's legacy ETH at
  `0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000` is one; it would have shown every OP wallet's ETH a second time.
- Registry assets are left out, because the registry path reads them. Symbols and names are trimmed to printable text
  of at most 24 and 64 characters. Logos are left out, so showing a found token never contacts another host.
- `scripts/verify-remote-config.py` checks the files: the format, and a chain id that the production registry lists as
  an EVM network that is not a testnet. It also checks for unique addresses in address order, decimals from 0 to 36 and
  no registry asset, and that the index matches the files (token count, SHA-256) and names only MIT sources.
- Today: Ethereum 2,396, Polygon 966, Arbitrum One 532, BNB Smart Chain 495, OP Mainnet 324, Avalanche C-Chain 294,
  Polygon zkEVM 30, ZetaChain 8, X Layer 3. Kaia, Viction and Oasys have no open list yet.

## Reading

Each EVM read of a network (`EvmBalanceService.fetchBalance`) reads the registry's tokens as before. Beside them, it
reads the tokens found outside the registry. These steps never fail the network's refresh by themselves.

- **The first read of a network for a wallet, then once a day** (`EvmTokenDiscoveryService.isScanDue`): every token
  on the network's list, through Multicall3 `aggregate3`. Each call carries 400 `balanceOf` calls, the next one starts
  when the previous answers, and a call that a node refuses for its size or gas is asked again in halves, down to 50. A
  node that is down or rate limiting is not asked again. Every token with a balance above zero is added. This happens
  on networks the wallet follows and on the others, in the discovery sweep.
- **Every read of the network** also reads the tokens found before, in one more call. That includes the 60 s poll
  while a wallet page is open (`SubscriptionService.refreshCurrentWallet`), Refresh, and the read after a send. A found
  token that now holds nothing reads 0 at once. The next complete list read removes it.
- **Refresh** reads the whole list again if the last list read began more than 5 minutes ago.
- **A list read that fails** is tried again 10 minutes later. A failed read of a found token keeps its last amount and
  is marked failed, as a registry token's is. While a wallet is being added, its networks' providers can be rebuilt
  more than once. A token read follows its network's provider to a new one twice at most. A read cut short that way is
  not counted as a failure, so the next read tries again.
- Wallets read a network's list one after another, never at once, so no node gets several lists together.
- A network without a list asks its node nothing more, and its read counts as done for the day. A network without
  Multicall3 code reads up to 64 listed tokens one call each (ethers batches them); a longer list is skipped there.
- The index and each list are fetched at most once every 6 hours, and only for networks the index names. When each
  wallet's list was last read on each network is kept in `evmTokenDiscovery`, so a restart does not read it again.

## What the wallet shows

- A found token is `assetMetadataTrust: 'unverified'` and `assetMetadataSource: 'tokenList'`
  (`BalanceService.setEvmTokenBalanceItem`). It is never priced and never counted in a total. The portfolio treats it
  like a Solana, TON or Iroha token outside the registry. While `assetDiscoveryMode` is `shadow`, the list leaves it out
  and its footer says "N more tokens found, not verified · Review". Manage assets lists it under "Found, not
  verified", where it can be shown.
- Found tokens are cached like other balances and come back at start (`hydrateBalanceStorage`), with their names.
- A found token that the registry starts to list becomes the registry's asset, verified, under the registry's id: in
  place while the wallet runs (`adoptEvmTokenAsRegistryAsset`), and from the cache at the next start.

## Checking it

- Unit: `tests/unit/evm-token-discovery.spec.ts` covers list validation, Multicall3 encoding and splitting, and scan
  timing. `tests/unit/evm-token-balances.spec.ts` drives the real balance services with only the RPC transport faked:
  discovery, polling through `refreshCurrentWallet`, hydration, registry adoption, failures and provider replacement.
  The script checks are `scripts/test-evm-token-lists.mjs` and `scripts/test-remote-config.py`.
- Live, wallet code: `FEARLESS_LIVE_EVM_TOKENS=1 vitest run tests/unit/evm-token-discovery-live.spec.ts` reads the
  lists of this checkout and the balances from the registry's own nodes. It checks account 0 of the BIP-39 test phrase
  ("abandon" eleven times, then "about"), a public test wallet that holds KICK on Ethereum and BUSD.e on Avalanche
  C-Chain. It is skipped without that variable.
- Live, extension: the harness in `output/evm-token-discovery-20261113/` (in the workspace, outside the repository)
  imports the same test wallet into a production build in Chrome for Testing. It serves this checkout's lists at their
  remote-config URL, and reads what the worker finds, stores and sends.

## Follow-ups

- Tokens on no list: the explorers the history screen already calls (`externalApi.history`) list the tokens an
  address has received. Using them to find more tokens would add no host.
- `wallet_watchAsset` (EIP-747), so a site can suggest a token.
- More list sources for BNB Smart Chain, Kaia, X Layer, Viction and ZetaChain.
