# Local Bitcoin and Solana sends

Run `node scripts/test-local-chain-sends.mjs` with `bitcoind` and
`solana-test-validator` available. The runner creates private local chains with
public test keys and shuts them down afterward. It never broadcasts to public
mainnet or testnet. The ordinary unit run skips these suites.

## Verified run — 2026-10-12

- Source: `d1da59e6122fc6fd0e6bffe1ed70bc8e73cff67c`.
- Node 24.19.0, Vitest 4.1.9, Bitcoin Core 31.1.0, Agave
  `solana-test-validator 4.3.0` (`7914985d`, feature set `c9ad34d2`), macOS arm64.
- Both files passed: **17 tests, zero failures, no skips**, 136.50 seconds.
- Parent-workspace evidence:
  `build/safe-upgrade/evidence/codex-20261012/local-chain-sends.log`.
  SHA-256: `e2cad4370e06f1eeec871a546c9b86f5d00366bf68b003d5ea8a3b654b444a13`.

Bitcoin's nine cases cover P2WPKH, Taproot, legacy and P2SH recipients; exact
quoted fees and wallet change; dust rejection; lost and ambiguous broadcast
responses; a pending mempool transaction without a duplicate payment; and the
quoted maximum amount. The Esplora shim maps testnet address encodings to regtest
while retaining the wallet's actual signed transaction bytes.

Solana's eight cases cover SOL receipt and exact fees; rent minimum rejection;
SPL transfer and one-time associated-account creation; invalid recipient types;
lost broadcast responses and provider failover without duplicate payment;
expiry without a transfer; and the quoted maximum amount. The suites call the
wallet's real send, quote and RPC code with public fixture keys.

This qualifies those source-level send paths on local chains. Final packaged
extension flows, remote provider availability and native app integration still
need their separate release checks.
