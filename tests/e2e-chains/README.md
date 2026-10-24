# Local Solana sends

Run `node scripts/test-local-chain-sends.mjs` with `solana-test-validator` on
`PATH` (or `FEARLESS_SOLANA_TEST_VALIDATOR`). The runner starts a disposable
validator on free loopback ports in a throwaway directory, funds the reference
wallet and an SPL mint at genesis, runs the specs in this folder with
`FEARLESS_LOCAL_CHAINS=1`, and stops the validator.

The specs drive the wallet's real background send code (`quoteSolanaTransfer`,
`makeSolanaTransfer`), its JSON-RPC client with failover, and the RPC balance
reader. Nothing here contacts mainnet, testnet or devnet, and no key material
other than the public reference phrase is used. Without the runner's
environment the specs are skipped, so the regular unit run never needs a chain.

Coverage: SOL to a new account at exactly the quoted fee, the rent-exempt
refusal, an SPL send that opens the recipient's token account once and charges
its deposit, token-account and program recipients refused, a lost broadcast
response settled exactly once, a never-relayed transaction reported as expired
with nothing sent, failover from a refusing node, and an exact maximum send.

Requirements: Node 24.19.0, Vitest, and Agave `solana-test-validator`.
