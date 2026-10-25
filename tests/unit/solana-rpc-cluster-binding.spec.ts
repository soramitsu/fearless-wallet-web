import { afterEach, describe, expect, it, vi } from 'vitest';

import { APIItemState } from '@extension-base/api/types/networks';
import SolanaBalanceService from '@extension-base/services/balance-service/SolanaBalanceService';
import {
  SOLANA_GENESIS_HASHES,
  SolanaBroadcastError,
  SolanaClusterCheckError,
  SolanaRpcClient,
  createClusterBoundSolanaRpcClient,
} from '@extension-base/services/solana-rpc-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';

const MAINNET = SOLANA_GENESIS_HASHES.mainnet;
const DEVNET = SOLANA_GENESIS_HASHES.devnet;
const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const ORIGIN_REFUSAL = { error: { code: 403, message: 'Access forbidden' }, id: 1, jsonrpc: '2.0' };

type Request = { id: number; method: string; params?: unknown[] };
type Handler = (request: Request, url: string) => Response;

let urlCounter = 0;
const uniqueUrl = (host: string) => `https://${host}-${(urlCounter += 1)}.example`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const result = (request: Request, value: unknown) => json({ id: request.id, jsonrpc: '2.0', result: value });

const fetchFor = (handlers: Record<string, Handler>) => {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const request = JSON.parse(String(init?.body)) as Request;

    calls.push({ method: request.method, url });

    const handler = handlers[url];

    if (!handler) throw new Error(`unexpected request to ${url}`);

    return handler(request, url);
  });

  return { calls, fetchFn };
};

const servingCluster = (genesis: string): Handler => (request) => {
  if (request.method === 'getGenesisHash') return result(request, genesis);
  if (request.method === 'getBalance') return result(request, { context: { slot: 1 }, value: 42 });
  if (request.method === 'sendTransaction') return result(request, '5'.repeat(88));

  return json({ error: { code: -32601, message: 'unexpected method' }, id: request.id, jsonrpc: '2.0' });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Solana RPC cluster binding', () => {
  it('skips an endpoint that serves another cluster and asks it nothing else', async () => {
    const wrong = uniqueUrl('devnet-node');
    const right = uniqueUrl('mainnet-node');
    const { calls, fetchFn } = fetchFor({ [wrong]: servingCluster(DEVNET), [right]: servingCluster(MAINNET) });
    const client = new SolanaRpcClient({
      expectedGenesisHash: MAINNET,
      failover: { sleep: async () => undefined },
      fetchFn,
      rpcUrls: [wrong, right],
    });

    await expect(client.getBalance(WALLET)).resolves.toBe(42);

    expect(calls.filter(({ url }) => url === wrong).map(({ method }) => method)).toEqual(['getGenesisHash']);
    expect(calls.filter(({ url }) => url === right).map(({ method }) => method)).toEqual(['getGenesisHash', 'getBalance']);
  });

  it('treats an endpoint that cannot name its cluster as unavailable', async () => {
    const refusing = uniqueUrl('refusing-node');
    const right = uniqueUrl('mainnet-node');
    const { calls, fetchFn } = fetchFor({
      [refusing]: () => json(ORIGIN_REFUSAL, 403),
      [right]: servingCluster(MAINNET),
    });
    const client = new SolanaRpcClient({
      expectedGenesisHash: MAINNET,
      failover: { sleep: async () => undefined },
      fetchFn,
      rpcUrls: [refusing, right],
    });

    await expect(client.getBalance(WALLET)).resolves.toBe(42);

    expect(calls.filter(({ url }) => url === refusing).map(({ method }) => method)).toEqual(['getGenesisHash']);
  });

  it('never returns data when every endpoint serves another cluster', async () => {
    const first = uniqueUrl('devnet-a');
    const second = uniqueUrl('devnet-b');
    const { calls, fetchFn } = fetchFor({ [first]: servingCluster(DEVNET), [second]: servingCluster(DEVNET) });
    const client = new SolanaRpcClient({
      expectedGenesisHash: MAINNET,
      failover: { rounds: 1, sleep: async () => undefined },
      fetchFn,
      rpcUrls: [first, second],
    });
    const error = await client.getBalance(WALLET).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SolanaClusterCheckError);
    expect((error as Error).message).toBe('solana_cluster_mismatch');
    expect(calls.every(({ method }) => method === 'getGenesisHash')).toBe(true);
  });

  it('asks an endpoint for its cluster once per window, even for concurrent requests', async () => {
    const node = uniqueUrl('mainnet-node');
    const { calls, fetchFn } = fetchFor({ [node]: servingCluster(MAINNET) });
    const client = new SolanaRpcClient({ expectedGenesisHash: MAINNET, fetchFn, rpcUrls: [node] });

    await Promise.all([client.getBalance(WALLET), client.getBalance(WALLET), client.getBalance(WALLET)]);
    await client.getBalance(WALLET);

    expect(calls.filter(({ method }) => method === 'getGenesisHash')).toHaveLength(1);
    expect(calls.filter(({ method }) => method === 'getBalance')).toHaveLength(4);
  });

  it('asks again after the window passes, so a node that changes cluster is caught', async () => {
    vi.useFakeTimers();

    try {
      const node = uniqueUrl('mainnet-node');
      let genesis = MAINNET;
      const { calls, fetchFn } = fetchFor({
        [node]: (request, url) => servingCluster(genesis)(request, url),
      });
      const client = new SolanaRpcClient({
        expectedGenesisHash: MAINNET,
        failover: { rounds: 1, sleep: async () => undefined },
        fetchFn,
        rpcUrls: [node],
      });

      await client.getBalance(WALLET);
      genesis = DEVNET;
      await vi.advanceTimersByTimeAsync(6 * 60_000);

      await expect(client.getBalance(WALLET)).rejects.toThrow('solana_cluster_mismatch');
      expect(calls.filter(({ method }) => method === 'getGenesisHash')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not bind a client that names no cluster, so private test chains keep working', async () => {
    const node = uniqueUrl('local-validator');
    const { calls, fetchFn } = fetchFor({ [node]: servingCluster('11111111111111111111111111111111') });
    const client = new SolanaRpcClient({ fetchFn, rpcUrls: [node] });

    await expect(client.getBalance(WALLET)).resolves.toBe(42);
    expect(calls.map(({ method }) => method)).toEqual(['getBalance']);
  });

  it('binds the factory client to the genesis hash of the named network', async () => {
    const node = uniqueUrl('node');
    const { fetchFn } = fetchFor({ [node]: servingCluster(DEVNET) });

    await expect(
      createClusterBoundSolanaRpcClient({ fetchFn, network: 'devnet', rpcUrls: [node] }).getBalance(WALLET)
    ).resolves.toBe(42);

    const other = uniqueUrl('node');
    const wrong = fetchFor({ [other]: servingCluster(DEVNET) });

    await expect(
      createClusterBoundSolanaRpcClient({
        failover: { rounds: 1, sleep: async () => undefined },
        fetchFn: wrong.fetchFn,
        network: 'mainnet',
        rpcUrls: [other],
      }).getBalance(WALLET)
    ).rejects.toThrow('solana_cluster_mismatch');
  });

  it('never posts a transaction to a wrong-cluster endpoint and does not call that outcome ambiguous', async () => {
    const wrong = uniqueUrl('devnet-node');
    const transaction = btoa(String.fromCharCode(...new Uint8Array(200).fill(1)));
    const { calls, fetchFn } = fetchFor({ [wrong]: servingCluster(DEVNET) });
    const client = new SolanaRpcClient({ expectedGenesisHash: MAINNET, fetchFn, rpcUrls: [wrong] });
    const error = await client.sendRawTransaction(transaction).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SolanaBroadcastError);
    expect((error as SolanaBroadcastError).ambiguous).toBe(false);
    expect(calls.map(({ method }) => method)).toEqual(['getGenesisHash']);
  });
});

describe('Solana balances without the indexer', () => {
  const solanaNetwork = {
    active: true,
    assets: [{ icon: 'solana', id: 'SOL', isNative: true, isUtility: true, name: 'Solana', precision: 9, symbol: 'SOL' }],
    chain: 'Solana',
    chainId: 'solana:mainnet',
    currentProvider: 'rpc',
    customNodes: [],
    ecosystem: 'solana',
    icon: 'solana',
    key: 'Solana',
    name: 'Solana',
    nodes: [],
    providers: {},
  } as unknown as NetworkJson;

  const createState = () =>
    ({
      balanceService: { balanceMap: {}, publishBalance: vi.fn(), updateBalanceStore: vi.fn() },
      networkService: {
        activeNetworkByEcosystem: { solana: [solanaNetwork] },
        networkMap: { Solana: solanaNetwork },
      },
      timeoutService: { lazyNext: (_key: string, callback: () => void) => callback() },
    }) as unknown as State;

  it('reads SOL from public nodes that accept an extension, never from the indexer, when the first node refuses', async () => {
    const requested: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const request = JSON.parse(String(init?.body)) as Request;

        requested.push(`${url} ${request.method}`);

        if (url.includes('si.soramitsu.io')) throw new Error('the indexer must not be used');
        if (url === 'https://api.mainnet-beta.solana.com') return json(ORIGIN_REFUSAL, 403);
        if (url === 'https://solana-rpc.publicnode.com') {
          if (request.method === 'getGenesisHash') return result(request, MAINNET);
          if (request.method === 'getBalance') return result(request, { context: { slot: 1 }, value: 2_289_207_225 });
          if (request.method === 'getTokenAccountsByOwner') {
            return json({ error: { code: -32602, message: 'Request blocked' }, id: request.id, jsonrpc: '2.0' }, 403);
          }
        }

        return json({ error: { code: 400, message: 'not available' }, id: request.id, jsonrpc: '2.0' }, 400);
      })
    );

    const state = createState();
    const service = new SolanaBalanceService(state);
    const response = await service.fetchBalance({ address: 'substrate-address', networks: ['Solana'], solanaAddress: WALLET });

    expect(response).toEqual([{ assetId: 'SOL', balance: '2.289207225', network: 'Solana' }]);
    expect(requested.some((entry) => entry.includes('si.soramitsu.io'))).toBe(false);
    expect(requested).toContain('https://solana-rpc.publicnode.com getBalance');
    expect(state.balanceService.balanceMap['substrate-address'][0].balances[0]).toMatchObject({
      scanCoverage: 'limited',
      state: APIItemState.READY,
      total: '2.289207225',
    });
  });
});
