// A tiny Esplora-compatible HTTP server over a local `bitcoind -regtest`, for
// the local-chain send tests only. It serves exactly the endpoints the wallet
// calls: address stats, UTXOs, fee estimates, broadcast, transaction status and
// outspends.
//
// The wallet's Bitcoin code knows mainnet and testnet. Regtest shares testnet's
// Base58 versions and BIP84 coin type 1 and differs only in the bech32 prefix,
// so the shim accepts testnet `tb1…` addresses and maps them onto regtest
// `bcrt1…` scripts. Transactions carry scripts, not prefixes, so the signed
// bytes the wallet produces are valid on regtest unchanged.

import http from 'node:http';
import { bech32, bech32m } from '@scure/base';

const SATS_PER_BTC = 100_000_000;
const STATIC_FEE_ESTIMATES = { 1: 3, 2: 2, 3: 2, 6: 1.5, 144: 1, 504: 1, 1008: 1 };

const toSats = (btc) => Math.round(btc * SATS_PER_BTC);

const recode = (address, hrp) => {
  const lower = address.toLowerCase();

  for (const coder of [bech32, bech32m]) {
    try {
      const decoded = coder.decode(lower, 120);

      return coder.encode(hrp, decoded.words, 120);
    } catch {
      // try the other checksum
    }
  }

  return address;
};

/** `tb1…` (testnet) to `bcrt1…` (regtest); Base58 addresses are shared. */
export const toRegtestAddress = (address) => (/^tb1/iu.test(address) ? recode(address, 'bcrt') : address);
/** `bcrt1…` (regtest) to `tb1…` (testnet) so the wallet accepts the address. */
export const toTestnetAddress = (address) => (/^bcrt1/iu.test(address) ? recode(address, 'tb') : address);

const emptyStats = () => ({ funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 });

async function buildIndex(rpc, blockCache) {
  const outputs = new Map();
  const spends = new Map();
  const transactions = new Map();
  const chain = [];
  let hash = await rpc.call('getbestblockhash');

  while (hash) {
    let block = blockCache.get(hash);

    if (!block) {
      block = await rpc.call('getblock', [hash, 2]);
      blockCache.set(hash, block);
    }
    chain.push(block);
    hash = block.previousblockhash;
  }
  chain.reverse();

  const addTransaction = (tx, status) => {
    transactions.set(tx.txid, status);
    tx.vout.forEach((output) => {
      const address = output.scriptPubKey?.address;

      outputs.set(`${tx.txid}:${output.n}`, {
        address,
        status,
        txid: tx.txid,
        value: toSats(output.value),
        vout: output.n,
      });
    });
    tx.vin.forEach((input, vin) => {
      if (input.coinbase) return;
      spends.set(`${input.txid}:${input.vout}`, { status, txid: tx.txid, vin });
    });
  };

  chain.forEach((block) =>
    block.tx.forEach((tx) =>
      addTransaction(tx, {
        block_hash: block.hash,
        block_height: block.height,
        block_time: block.time,
        confirmed: true,
      })
    )
  );

  const mempool = await rpc.call('getrawmempool');

  for (const txid of mempool) {
    try {
      addTransaction(await rpc.call('getrawtransaction', [txid, true]), { confirmed: false });
    } catch {
      // evicted between the two calls
    }
  }

  return { outputs, spends, transactions };
}

function addressStats(index, address) {
  const chain = emptyStats();
  const mempool = emptyStats();
  const chainTxs = new Set();
  const mempoolTxs = new Set();

  index.outputs.forEach((output, outpoint) => {
    if (output.address !== address) return;

    const funded = output.status.confirmed ? chain : mempool;

    funded.funded_txo_count += 1;
    funded.funded_txo_sum += output.value;
    (output.status.confirmed ? chainTxs : mempoolTxs).add(output.txid);

    const spend = index.spends.get(outpoint);

    if (spend) {
      const spent = spend.status.confirmed ? chain : mempool;

      spent.spent_txo_count += 1;
      spent.spent_txo_sum += output.value;
      (spend.status.confirmed ? chainTxs : mempoolTxs).add(spend.txid);
    }
  });

  chain.tx_count = chainTxs.size;
  mempool.tx_count = mempoolTxs.size;

  return { chain_stats: chain, mempool_stats: mempool };
}

function addressUtxos(index, address) {
  const utxos = [];

  index.outputs.forEach((output, outpoint) => {
    if (output.address !== address || index.spends.has(outpoint)) return;
    utxos.push({ status: output.status, txid: output.txid, value: output.value, vout: output.vout });
  });

  return utxos;
}

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

export async function startEsploraShim({ host = '127.0.0.1', port = 0, rpc }) {
  const blockCache = new Map();
  const requests = [];

  const handle = async (request) => {
    const url = new URL(request.url, `http://${host}`);
    const parts = url.pathname.split('/').filter(Boolean);

    requests.push(`${request.method} ${url.pathname}`);

    if (request.method === 'POST' && url.pathname === '/tx') {
      try {
        return { body: await rpc.call('sendrawtransaction', [(await readBody(request)).trim()]), status: 200 };
      } catch (error) {
        return {
          body: `sendrawtransaction RPC error: ${JSON.stringify({ code: error.code, message: error.rpcMessage ?? error.message })}`,
          status: 400,
        };
      }
    }

    if (request.method !== 'GET') return { body: 'Method not allowed', status: 405 };
    if (url.pathname === '/fee-estimates') return { json: STATIC_FEE_ESTIMATES };

    const index = await buildIndex(rpc, blockCache);

    if (parts[0] === 'address' && parts[1]) {
      const requested = decodeURIComponent(parts[1]);
      const address = toRegtestAddress(requested);

      if (parts.length === 2) return { json: { address: requested, ...addressStats(index, address) } };
      if (parts[2] === 'utxo') return { json: addressUtxos(index, address) };
      if (parts[2] === 'txs') return { json: [] };
    }

    if (parts[0] === 'tx' && parts[1]) {
      const status = index.transactions.get(parts[1]);

      if (parts[2] === 'status') return status ? { json: status } : { body: 'Transaction not found', status: 404 };
      if (parts[2] === 'outspend' && parts[3] !== undefined) {
        const spend = index.spends.get(`${parts[1]}:${Number(parts[3])}`);

        return { json: spend ? { spent: true, status: spend.status, txid: spend.txid, vin: spend.vin } : { spent: false } };
      }
      if (parts[2] === 'hex') {
        try {
          return { body: await rpc.call('getrawtransaction', [parts[1], false]), status: 200 };
        } catch {
          return { body: 'Transaction not found', status: 404 };
        }
      }
    }

    return { body: 'Not found', status: 404 };
  };

  const server = http.createServer((request, response) => {
    handle(request)
      .then(({ body, json, status = 200 }) => {
        const payload = json === undefined ? String(body) : JSON.stringify(json);

        response.writeHead(status, {
          'content-length': Buffer.byteLength(payload),
          'content-type': json === undefined ? 'text/plain' : 'application/json',
        });
        response.end(payload);
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'text/plain' });
        response.end(String(error?.message ?? error));
      });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));

  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    requests,
    url: `http://${host}:${server.address().port}`,
  };
}
