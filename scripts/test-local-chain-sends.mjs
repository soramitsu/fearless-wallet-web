#!/usr/bin/env node
// End-to-end Solana send tests against a local private chain only:
// `solana-test-validator`. The tests drive the wallet's real send code. The
// chain holds no value, and nothing here contacts mainnet, testnet or devnet.
//
//   node scripts/test-local-chain-sends.mjs
//
// Environment:
//   FEARLESS_SOLANA_TEST_VALIDATOR solana-test-validator binary (default: on PATH)
//   FEARLESS_LOCAL_CHAINS_DIR     data directory (default: a fresh temp dir)

import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeSolanaGenesisAccounts } from './local-chains/solana-genesis-accounts.mjs';
import { spawnLocalProcess } from './local-chains/process-lifecycle.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectors = JSON.parse(await fs.readFile(path.join(rootDir, 'docs/universal-wallet-v2-vectors.json'), 'utf8'));
const walletSolanaAddress = vectors.vectors[0].expected.solana.address;

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });
  });

async function freePortRange(size) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const start = 20_000 + Math.floor(Math.random() * 30_000);
    const ports = Array.from({ length: size }, (_, index) => start + index);
    const results = await Promise.all(
      ports.map(
        (port) =>
          new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', () => resolve(false));
            server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
          })
      )
    );

    if (results.every(Boolean)) return start;
  }

  throw new Error('no free port range');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startSolanaValidator(dataDir) {
  const rpcPort = await freePort();
  const faucetPort = await freePort();
  const gossipPort = await freePort();
  const dynamicStart = await freePortRange(30);
  const genesis = await writeSolanaGenesisAccounts({
    directory: path.join(dataDir, 'accounts'),
    tokenAmount: 1_000_000_000n,
    wallet: walletSolanaAddress,
    walletLamports: 20_000_000_000,
  });
  const owned = spawnOwned(
    process.env.FEARLESS_SOLANA_TEST_VALIDATOR || 'solana-test-validator',
    [
      '--ledger',
      path.join(dataDir, 'ledger'),
      '--reset',
      '--quiet',
      '--bind-address',
      '127.0.0.1',
      '--rpc-port',
      String(rpcPort),
      '--faucet-port',
      String(faucetPort),
      '--gossip-port',
      String(gossipPort),
      '--dynamic-port-range',
      `${dynamicStart}-${dynamicStart + 29}`,
      ...genesis.args,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
    cleanup
  );

  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    owned.assertRunning();

    try {
      const response = await fetch(rpcUrl, {
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'getBalance', params: [walletSolanaAddress] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      });
      const body = await response.json();

      if (body.result?.value > 0) return { mint: genesis.mint, rpcUrl, walletTokenAccount: genesis.walletTokenAccount };
    } catch {
      // still starting
    }
    await wait(500);
  }

  throw new Error(`solana-test-validator did not become ready: ${owned.diagnostic()}`);
}

const baseDir = process.env.FEARLESS_LOCAL_CHAINS_DIR
  ? path.resolve(process.env.FEARLESS_LOCAL_CHAINS_DIR)
  : await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-local-chains-'));
const runDir = path.join(baseDir, `run-${Date.now()}-${process.pid}`);
const cleanup = [];
let exitCode = 1;
let cleanupPromise;
let shuttingDown = false;
function spawnOwned(command, args, options, owners) {
  if (shuttingDown) throw new Error('Local-chain test runner is shutting down');
  return spawnLocalProcess(command, args, options, owners);
}
const cleanUp = () => cleanupPromise ??= (async () => {
  shuttingDown = true;
  for (const step of cleanup.reverse()) {
    await step().catch((error) => console.error('cleanup failed', error));
  }
  await fs.rm(runDir, { force: true, recursive: true }).catch(() => undefined);
})();
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => { void cleanUp().then(() => process.exit(code)); });
}

try {
  await fs.mkdir(runDir, { recursive: true });

  const env = { ...process.env, FEARLESS_LOCAL_CHAINS: '1' };
  const specs = [];

  const solana = await startSolanaValidator(path.join(runDir, 'solana'));

  Object.assign(env, {
    FEARLESS_E2E_SOLANA_MINT: solana.mint,
    FEARLESS_E2E_SOLANA_RPC_URL: solana.rpcUrl,
    FEARLESS_E2E_SOLANA_WALLET_TOKEN_ACCOUNT: solana.walletTokenAccount,
  });
  specs.push('tests/e2e-chains/solana-local-validator-send.spec.ts');
  console.info(`solana-test-validator ready at ${solana.rpcUrl}`);

  const vitest = spawnOwned(
    process.execPath,
    [path.join(rootDir, 'node_modules/.bin/vitest'), 'run', ...specs, '--testTimeout=240000', '--hookTimeout=240000'],
    { cwd: rootDir, env, stdio: 'inherit' },
    cleanup
  ).child;

  exitCode = await new Promise((resolve) => {
    vitest.once('error', (error) => { console.error(error); resolve(1); });
    vitest.once('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await cleanUp();
}

process.exit(exitCode);
