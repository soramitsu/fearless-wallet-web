import {
  BitcoinEsploraClient,
  BitcoinIndexerError,
} from '@extension-base/services/bitcoin-indexer-service';

const MAINNET_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const TESTNET_ADDRESS = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
const TXID = '11'.repeat(32);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function addressResponse(address = MAINNET_ADDRESS) {
  return {
    address,
    chain_stats: {
      funded_txo_count: 2,
      funded_txo_sum: 100_000,
      spent_txo_count: 1,
      spent_txo_sum: 40_000,
      tx_count: 3,
    },
    mempool_stats: {
      funded_txo_count: 1,
      funded_txo_sum: 5_000,
      spent_txo_count: 0,
      spent_txo_sum: 0,
      tx_count: 1,
    },
  };
}

describe('BitcoinEsploraClient', () => {
  it('builds Esplora read URLs for mainnet and computes balances', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());

      return jsonResponse(addressResponse());
    });
    const client = new BitcoinEsploraClient({ fetchFn });

    expect(await client.getBalance(MAINNET_ADDRESS)).toEqual({
      confirmedSats: 60_000,
      mempoolSats: 5_000,
      totalSats: 65_000,
    });

    expect(calls).toEqual([`https://blockstream.info/api/address/${MAINNET_ADDRESS}`]);
  });

  it('builds testnet UTXO and transaction URLs', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());

      if (input.toString().endsWith('/utxo')) {
        return jsonResponse([
          {
            status: { confirmed: true, block_height: 1, block_hash: TXID, block_time: 1_700_000_000 },
            txid: TXID,
            value: 12_345,
            vout: 0,
          },
        ]);
      }

      return jsonResponse([
        {
          fee: 141,
          status: { confirmed: false },
          txid: TXID,
          weight: 561,
        },
      ]);
    });
    const client = new BitcoinEsploraClient({ fetchFn, network: 'testnet' });

    expect(await client.getUtxos(TESTNET_ADDRESS)).toHaveLength(1);
    expect(await client.getTransactions(TESTNET_ADDRESS)).toHaveLength(1);
    expect(await client.getTransactions(TESTNET_ADDRESS, { lastSeenTxid: TXID })).toHaveLength(1);
    expect(await client.getTransactions(TESTNET_ADDRESS, { mempool: true })).toHaveLength(1);

    expect(calls).toEqual([
      `https://blockstream.info/testnet/api/address/${TESTNET_ADDRESS}/utxo`,
      `https://blockstream.info/testnet/api/address/${TESTNET_ADDRESS}/txs`,
      `https://blockstream.info/testnet/api/address/${TESTNET_ADDRESS}/txs/chain/${TXID}`,
      `https://blockstream.info/testnet/api/address/${TESTNET_ADDRESS}/txs/mempool`,
    ]);
  });

  it('fetches fee estimates and broadcasts raw transactions', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ init, url: input.toString() });

      if (init?.method === 'POST') return new Response(TXID);

      return jsonResponse({ 1: 5.5, 2: 3 });
    });
    const client = new BitcoinEsploraClient({ baseUrl: 'https://bitcoin.example/api/', fetchFn });

    expect(await client.getFeeEstimates()).toEqual({ 1: 5.5, 2: 3 });
    expect(await client.broadcastTransaction('00aa')).toBe(TXID);

    expect(calls).toEqual([
      { init: undefined, url: 'https://bitcoin.example/api/fee-estimates' },
      {
        init: {
          body: '00aa',
          headers: { 'content-type': 'text/plain' },
          method: 'POST',
        },
        url: 'https://bitcoin.example/api/tx',
      },
    ]);
  });

  it('rejects unsafe URLs and malformed inputs before fetch', async () => {
    const fetchFn = vi.fn();
    const client = new BitcoinEsploraClient({ fetchFn });

    expect(() => new BitcoinEsploraClient({ baseUrl: 'http://blockstream.info/api', fetchFn })).toThrow(BitcoinIndexerError);
    expect(() => new BitcoinEsploraClient({ baseUrl: 'http://localhost:3000/api', fetchFn })).not.toThrow();
    await expect(client.getAddress(TESTNET_ADDRESS)).rejects.toThrow(BitcoinIndexerError);
    await expect(client.getTransactions(MAINNET_ADDRESS, { lastSeenTxid: '../bad' })).rejects.toThrow(BitcoinIndexerError);
    await expect(client.broadcastTransaction('abc')).rejects.toThrow(BitcoinIndexerError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws typed errors for HTTP failures, malformed JSON, and invalid response shapes', async () => {
    const httpFailure = new BitcoinEsploraClient({
      fetchFn: vi.fn(async () => jsonResponse({ error: 'down' }, 503)),
    });

    await expect(httpFailure.getBalance(MAINNET_ADDRESS)).rejects.toMatchObject({
      body: { error: 'down' },
      name: 'BitcoinIndexerError',
      status: 503,
    });

    const malformedJson = new BitcoinEsploraClient({
      fetchFn: vi.fn(async () => new Response('{bad-json', { status: 200 })),
    });

    await expect(malformedJson.getBalance(MAINNET_ADDRESS)).rejects.toMatchObject({
      message: 'invalid_json',
      name: 'BitcoinIndexerError',
    });

    const malformedShape = new BitcoinEsploraClient({
      fetchFn: vi.fn(async () => jsonResponse({ address: MAINNET_ADDRESS, chain_stats: {}, mempool_stats: {} })),
    });

    await expect(malformedShape.getBalance(MAINNET_ADDRESS)).rejects.toThrow(BitcoinIndexerError);

    const badBroadcast = new BitcoinEsploraClient({
      fetchFn: vi.fn(async () => new Response('not-a-txid', { status: 200 })),
    });

    await expect(badBroadcast.broadcastTransaction('00aa')).rejects.toThrow(BitcoinIndexerError);
  });
});
