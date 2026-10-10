#!/usr/bin/env node
// End-to-end Bitcoin and Solana send tests against local private chains only:
// `bitcoind -regtest` behind a small Esplora-compatible shim, and
// `solana-test-validator`. The tests drive the wallet's real send code. These
// chains hold no value, and nothing here contacts mainnet or testnet.
//
//   node scripts/test-local-chain-sends.mjs [--bitcoin-only | --solana-only]
//
// Environment:
//   FEARLESS_BITCOIND             bitcoind binary (default: bitcoind on PATH)
//   FEARLESS_SOLANA_TEST_VALIDATOR solana-test-validator binary (default: on PATH)
//   FEARLESS_LOCAL_CHAINS_DIR     data directory (default: a fresh temp dir)

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBitcoindRpc, waitForBitcoind } from './local-chains/bitcoind-rpc.mjs';
import { startEsploraShim } from './local-chains/esplora-regtest-shim.mjs';
import { writeSolanaGenesisAccounts } from './local-chains/solana-genesis-accounts.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const runBitcoin = !args.has('--solana-only');
const runSolana = !args.has('--bitcoin-only');
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

async function startBitcoind(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });

  const rpcPort = await freePort();
  const p2pPort = await freePort();
  const user = 'fearless';
  const password = randomBytes(16).toString('hex');
  const child = spawn(
    process.env.FEARLESS_BITCOIND || 'bitcoind',
    [
      '-regtest',
      `-datadir=${dataDir}`,
      `-rpcport=${rpcPort}`,
      `-port=${p2pPort}`,
      '-rpcbind=127.0.0.1',
      '-rpcallowip=127.0.0.1',
      `-rpcuser=${user}`,
      `-rpcpassword=${password}`,
      '-listen=0',
      '-dnsseed=0',
      '-fixedseeds=0',
      '-txindex=1',
      '-fallbackfee=0.0002',
      '-printtoconsole=0',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const rpc = createBitcoindRpc({ password, url: rpcUrl, user });

  await waitForBitcoind(rpc).catch((error) => {
    throw new Error(`${error.message}${stderr ? `: ${stderr.slice(-2000)}` : ''}`);
  });

  return { child, password, rpc, rpcUrl, user };
}

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
  const child = spawn(
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
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`solana-test-validator exited: ${stderr.slice(-2000)}`);

    try {
      const response = await fetch(rpcUrl, {
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'getBalance', params: [walletSolanaAddress] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body = await response.json();

      if (body.result?.value > 0) return { child, mint: genesis.mint, rpcUrl, walletTokenAccount: genesis.walletTokenAccount };
    } catch {
      // still starting
    }
    await wait(500);
  }

  throw new Error(`solana-test-validator did not become ready: ${stderr.slice(-2000)}`);
}

function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 15_000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill(signal);
  });
}

const baseDir = process.env.FEARLESS_LOCAL_CHAINS_DIR
  ? path.resolve(process.env.FEARLESS_LOCAL_CHAINS_DIR)
  : await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-local-chains-'));
const runDir = path.join(baseDir, `run-${Date.now()}-${process.pid}`);
const cleanup = [];
let exitCode = 1;

try {
  await fs.mkdir(runDir, { recursive: true });

  const env = { ...process.env, FEARLESS_LOCAL_CHAINS: '1' };
  const specs = [];

  if (runBitcoin) {
    const bitcoin = await startBitcoind(path.join(runDir, 'bitcoin'));

    cleanup.push(async () => {
      await bitcoin.rpc.call('stop').catch(() => undefined);
      await stop(bitcoin.child);
    });

    const shim = await startEsploraShim({ rpc: bitcoin.rpc });

    cleanup.push(() => shim.close());
    Object.assign(env, {
      FEARLESS_E2E_BITCOIND_PASSWORD: bitcoin.password,
      FEARLESS_E2E_BITCOIND_RPC_URL: bitcoin.rpcUrl,
      FEARLESS_E2E_BITCOIND_USER: bitcoin.user,
      FEARLESS_E2E_ESPLORA_URL: shim.url,
    });
    specs.push('tests/e2e-chains/bitcoin-regtest-send.spec.ts');
    console.info(`bitcoind -regtest ready; Esplora shim at ${shim.url}`);
  }

  if (runSolana) {
    const solana = await startSolanaValidator(path.join(runDir, 'solana'));

    cleanup.push(() => stop(solana.child));
    Object.assign(env, {
      FEARLESS_E2E_SOLANA_MINT: solana.mint,
      FEARLESS_E2E_SOLANA_RPC_URL: solana.rpcUrl,
      FEARLESS_E2E_SOLANA_WALLET_TOKEN_ACCOUNT: solana.walletTokenAccount,
    });
    specs.push('tests/e2e-chains/solana-local-validator-send.spec.ts');
    console.info(`solana-test-validator ready at ${solana.rpcUrl}`);
  }

  const vitest = spawn(
    process.execPath,
    [path.join(rootDir, 'node_modules/.bin/vitest'), 'run', ...specs, '--testTimeout=240000', '--hookTimeout=240000'],
    { cwd: rootDir, env, stdio: 'inherit' }
  );

  exitCode = await new Promise((resolve) => vitest.once('exit', (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  for (const step of cleanup.reverse()) {
    await step().catch((error) => console.error('cleanup failed', error));
  }
  await fs.rm(runDir, { force: true, recursive: true }).catch(() => undefined);
}

process.exit(exitCode);
