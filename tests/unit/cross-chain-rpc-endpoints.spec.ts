import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiPromise } from '@polkadot/api';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { REVIEWED_RPC_HOSTS, assertReviewedRpcEndpoint, connectedRpcEndpoint } from '@/cross-chain/reviewedEndpoints';
import { assertReviewedRuntimeAuthority, type BridgeRuntimeApi } from '@/cross-chain/reviewedRuntimeAuthority';
import { BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES } from '@/cross-chain/reviewedRoutes';
import { REVIEWED_RUNTIMES } from '@/cross-chain/reviewedRuntimes';

const productionRegistry = JSON.parse(
  readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8')
) as NetworkJson[];

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';
const connectedTo = (endpoint: unknown) => ({ _rpcCore: { provider: { endpoint } } });

describe('reviewed RPC hosts for cross-chain quotes', () => {
  it('lists the hosts of the production registry nodes of each reviewed chain', () => {
    for (const [chainId, hosts] of Object.entries(REVIEWED_RPC_HOSTS)) {
      const network = productionRegistry.find((row) => row.chainId === chainId);

      expect(network, chainId).toBeDefined();
      expect([...hosts].sort(), network!.name).toEqual(network!.nodes.map(({ url }) => new URL(url).hostname).sort());
    }
  });

  it('covers every chain of the reviewed runtime table and of the bundled routes', () => {
    const chains = new Set([
      ...REVIEWED_RUNTIMES.map(({ chainId }) => chainId),
      ...BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.flatMap(({ originChainId, destinationChainId }) => [
        originChainId,
        destinationChainId,
      ]),
    ]);

    expect([...chains].sort()).toEqual(Object.keys(REVIEWED_RPC_HOSTS).sort());
  });

  it('accepts every reviewed host, including a Dwellir endpoint that carries the API key', () => {
    for (const [chainId, hosts] of Object.entries(REVIEWED_RPC_HOSTS)) {
      for (const host of hosts) {
        expect(() => assertReviewedRpcEndpoint(chainId, connectedTo(`wss://${host}/ws`)), host).not.toThrow();
      }
    }
    expect(() => assertReviewedRpcEndpoint(POLKADOT, connectedTo('wss://api-polkadot.dwellir.com/key'))).not.toThrow();
    expect(() => assertReviewedRpcEndpoint(POLKADOT, connectedTo('wss://RPC.Polkadot.io'))).not.toThrow();
  });

  it.each([
    ['another host', 'wss://rpc.example'],
    ['a plain-text connection to a reviewed host', 'ws://rpc.polkadot.io'],
    ['an HTTP connection', 'https://rpc.polkadot.io'],
    ['another port', 'wss://rpc.polkadot.io:9944'],
    ['credentials', 'wss://user:secret@rpc.polkadot.io'],
    ['a host that only starts like a reviewed one', 'wss://rpc.polkadot.io.example'],
    ['a reviewed host of another chain', 'wss://kusama-rpc.polkadot.io'],
    ['an unreadable endpoint', 'not a url'],
    ['no endpoint', undefined],
  ])('refuses %s', (_label, endpoint) => {
    expect(() => assertReviewedRpcEndpoint(POLKADOT, connectedTo(endpoint))).toThrow(
      'cross_chain_rpc_endpoint_not_reviewed'
    );
  });

  it('refuses a chain without reviewed hosts', () => {
    expect(() => assertReviewedRpcEndpoint('ab'.repeat(32), connectedTo('wss://rpc.polkadot.io'))).toThrow(
      'cross_chain_rpc_endpoint_not_reviewed'
    );
    expect(() => assertReviewedRpcEndpoint(POLKADOT, null)).toThrow('cross_chain_rpc_endpoint_not_reviewed');
  });

  it('reads the endpoint of the provider a polkadot-js API talks to', async () => {
    // WsProvider exposes the endpoint it connects to; this offline provider only reports one.
    const provider = {
      endpoint: 'wss://rpc.polkadot.io',
      hasSubscriptions: true,
      isClonable: false,
      isConnected: false,
      stats: { active: { requests: 0, subscriptions: 0 }, total: {} },
      clone() {
        return this;
      },
      connect: async () => undefined,
      disconnect: async () => undefined,
      on: () => () => undefined,
      send: async () => Promise.reject(new Error('offline')),
      subscribe: async () => Promise.reject(new Error('offline')),
      unsubscribe: async () => true,
    };
    const api = new ApiPromise({ provider: provider as never, noInitWarn: true });
    void api.isReadyOrError.catch(() => undefined);

    try {
      expect(connectedRpcEndpoint(api)).toBe('wss://rpc.polkadot.io');
    } finally {
      await api.disconnect();
    }
  });
});

describe('cross-chain runtime authority', () => {
  const execution = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.find(({ originChainId }) => originChainId === KUSAMA)!.execution!;
  const runtimeApi = (chainId: string, endpoint: string): BridgeRuntimeApi =>
    ({
      consts: { balances: { existentialDeposit: { toString: () => '3333333' } } },
      createType: vi.fn(),
      genesisHash: { toHex: () => `0x${chainId}` },
      isConnected: true,
      isReadyOrError: Promise.resolve(),
      query: {},
      tx: {},
      ...connectedTo(endpoint),
    }) as unknown as BridgeRuntimeApi;
  const state = (origin: string, destination: string) =>
    ({
      getSubstrateApiMap: {
        kusama: { api: runtimeApi(execution.originChainId, origin) },
        'kusama assethub': { api: runtimeApi(execution.destinationChainId, destination) },
      },
      networkService: {
        networkValues: [
          { chainId: execution.originChainId, name: 'Kusama' },
          { chainId: execution.destinationChainId, name: 'Kusama AssetHub' },
        ],
        substrateApiHandler: { initApi: vi.fn() },
      },
    }) as unknown as State;

  it('quotes through reviewed hosts', async () => {
    await expect(
      assertReviewedRuntimeAuthority(execution, state('wss://kusama-rpc.polkadot.io', 'wss://ksm-rpc.stakeworld.io/assethub'))
    ).resolves.toMatchObject({ runtimeMinimum: '0.000003333333' });
  });

  it.each([
    ['origin', 'wss://rpc.example', 'wss://ksm-rpc.stakeworld.io/assethub'],
    ['destination', 'wss://kusama-rpc.polkadot.io', 'wss://assethub.example'],
  ])('refuses a quote when the %s node is not a reviewed host', async (_label, origin, destination) => {
    await expect(assertReviewedRuntimeAuthority(execution, state(origin, destination))).rejects.toThrow(
      'cross_chain_rpc_endpoint_not_reviewed'
    );
  });
});
