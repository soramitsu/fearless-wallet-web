# How balances arrive and stay current

The wallet shows what it holds without asking anyone to add tokens. This page says when balances are read, how the
list says what it does not know yet, and how tokens off the wallet's own networks are found. The portfolio rules
(what is counted, hidden, grouped) are in `docs/portfolio-dashboard.md`.

## When balances are read

| Moment | What is read |
| --- | --- |
| The worker starts or wakes | The selected wallet at once (`FIRST_SERVICE_INFO_DELAY_MS`, 20 ms). The other wallets 3 s later (`OTHER_WALLETS_START_DELAY_MS`), so they do not compete for the same nodes. EVM and Substrate are read together. |
| A Substrate network connects | Its balances are subscribed as soon as the connection is ready. Every later change arrives by itself. |
| A wallet page opens on an awake wallet | Ecosystems read more than 20 s ago (`PAGE_OPEN_REFRESH_AGE_MS`). A quiet wallet reads everything as it reconnects. |
| A wallet page stays open | EVM, TON and Solana every 60 s; Bitcoin and Iroha every 180 s (`BALANCE_POLL_MS`), because each of their reads walks addresses or pages assets on public indexers. Nothing is polled while no wallet page is open (`CronService.pollBalances`). |
| Refresh (list toolbar, or Refresh in the balance status sheet) | `pri(balance.refresh)`: every polled ecosystem of the selected wallet, forcing the EVM read, and the Substrate subscriptions started again. The button stops spinning when they answer or after 15 s (`REFRESH_WAIT_MS`). It also starts the search below. |
| After a send | EVM, Solana and Bitcoin read again 8 s later; Iroha at once; Substrate through its subscription. |

An ecosystem that is still being read is not read a second time; Refresh waits for that read instead.

Balance changes reach the open pages no more than 400 ms after the first of them (`BALANCE_PUBLISH_MAX_WAIT_MS`),
gathered over 120 ms (`BALANCE_PUBLISH_DELAY_MS`). Before, each change postponed the message again, so a wallet on many
networks was sent nothing until the slowest network had answered.

## What the list says while balances arrive

- **Saved picture.** Balances from an earlier visit are shown at once, while the networks answer again. A loader is
  shown only when nothing is held yet, nothing was saved and the networks are still answering: the first open of a
  wallet, or the first open after an update from 3.0.5 (`getPortfolioLoadStatus`).
- **Checking.** For the first 20 s (`PORTFOLIO_FIRST_LOAD_TIMEOUT_MS`) the list says "Checking N networks…" and the
  header's status says **Updating**: the total includes what has arrived and grows as networks answer. The status
  sheet lists the networks still answering.
- **Not responding.** After those 20 s, the list says "N networks are not responding" and the status sheet lists them
  under "Not responding". The header's status goes back to what the wallet's holdings say (Live, Saved, or Partial when
  a network where the wallet holds value failed): a registry keeps networks that no longer run, and those would
  otherwise make every total "partial".
- **Looking for your tokens.** While the search below reads networks for the first time, the list says
  "Looking for your tokens on every network · checked of total".

## Finding tokens on other networks

The wallet reads every network it follows for every wallet. The discovery sweep (`AssetDiscoverySweepService`) reads
the registry's other production networks:

- A network no wallet has been read on yet is read in the next sweep, four at a time, the ranked networks first: after
  a wallet is created or imported, after the registry gains a network or an asset, and once after updating from a
  build that read 24 networks a day. A new wallet's holdings anywhere in the registry are found in minutes.
- After that, a daily sweep reads again the 24 networks read longest ago.
- A network the wallets follow is left to their own reads.
- A network that does not answer within 60 s counts as failed; its first read is tried again an hour later, or at once
  on Refresh.
- The sweep runs one at a time and keeps its state in `assetDiscoverySweep` (`scannedAt`, `failedAt`, the wallets and
  each network's asset list), written as it goes, so a sweep that is cut short resumes.

On EVM networks, each read also finds ERC-20 tokens outside the registry: once a day it reads every token on the
network's token list through Multicall3, on the network's own node, and every read reads again the tokens found before
(`docs/evm-token-discovery.md`).

What it finds on the registry's own tokens shows in the list like any holding. Tokens found that are not on the
verified list (Solana, TON and Iroha tokens outside the registry, and ERC-20 tokens found through the lists) are never
counted. While discovered-asset surfacing
is off (`assetDiscoveryMode: 'shadow'`, the fail-closed default; a fresh remote `web_config.json` can set `visible`),
the list leaves them out and its footer says "N more tokens found, not verified · Review", which opens Manage assets on
"Found, not verified".

## Checking it

- Unit: `tests/unit/balance-responsiveness.spec.ts`, `balance-status-popup.spec.ts`, `asset-discovery-sweep.spec.ts`,
  `portfolio-loading.spec.ts`, `portfolio-dashboard-sync-state.spec.ts`, `timeout-service-reentrancy.spec.ts`,
  `evm-token-discovery.spec.ts`, `evm-token-balances.spec.ts`.
- Timing against the live networks: a production build driven by a headless Chrome for Testing, recording when each
  network's balance arrives in a page on first open, on reopen, and after the worker was stopped.
