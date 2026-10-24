import { Address, beginCell } from '@ton/core';
import { TonApiHandler } from '@extension-base/services/network-service/handlers/TonApiHandler';
import {
  TonProviderError,
  TonProviderRouter,
  registryNodeUrlOf,
  tonNetworkKindOf,
  type TonProviderOptions,
} from '@extension-base/services/ton-provider';
import registrySnapshot from '../fixtures/legacy-305/chains-v13.snapshot.json';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import type { TonApiClientLike } from '@extension-base/services/ton-provider/RegistryNodeTonProvider';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_TON_PROVIDER } from '@/consts/universalWallet';

const TI = 'https://ti.soramitsu.io';
const TONAPI = 'https://tonapi.io';
const ADDRESS = Address.parse(tiResponses.address);
const BALANCE_PATH = `/api/indexer/v1/accounts/${tiResponses.address}/balance`;

// TON Mainnet as the shipped chains/v13 registry lists it: one TonAPI node, tonapi.io.
const tonMainnet = (registrySnapshot as unknown as NetworkJson[]).find(({ name }) => name === 'TON Mainnet')!;

type Route = { status: number; body: unknown };

// TI as it answers today: no service-info route, every account answer says "testnet", no TonAPI routes.
const deployedTi: Record<string, Route> = {
  'GET /api/indexer/v1/service-info': tiResponses.deployed.serviceInfo,
  [`GET ${BALANCE_PATH}`]: tiResponses.deployed.balance,
};

const mainnetTi = (overrides: Record<string, unknown> = {}): Record<string, Route> => ({
  'GET /api/indexer/v1/service-info': { status: 200, body: { ...tiResponses.sourceMainnetServiceInfo, ...overrides } },
  [`GET ${BALANCE_PATH}`]: { status: 200, body: { ...tiResponses.deployed.balance.body, network: 'mainnet' } },
});

function tiServer(routes: Record<string, Route | ((init?: RequestInit) => Route)>) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    const route = routes[key] ?? { status: 404, body: { message: `Route ${key} not found`, statusCode: 404 } };
    const { status, body } = typeof route === 'function' ? route(init) : route;

    expect(url.origin).toBe(TI);

    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}

function tonApi({ globalId = -239, balance = 42_000_000_000n } = {}) {
  const client = {
    accounts: {
      getAccount: vi.fn(async () => ({ balance, status: 'active' })),
      getAccountJettonsBalances: vi.fn(async () => ({ balances: [] })),
      getAccountEvents: vi.fn(async () => ({ events: [] })),
    },
    blockchain: {
      getBlockchainMasterchainHead: vi.fn(async () => ({ globalId })),
      sendBlockchainMessage: vi.fn(async () => undefined),
    },
    rates: { getRates: vi.fn(async () => ({ rates: {} })) },
    wallet: { getAccountSeqno: vi.fn(async () => ({ seqno: 4 })) },
  };
  const createTonApiClient = vi.fn((_options: { baseUrl: string; apiKey?: string }) => client as unknown as TonApiClientLike);

  return { client, createTonApiClient };
}

function router(
  routes: Record<string, Route | ((init?: RequestInit) => Route)>,
  options: TonProviderOptions & { node?: ReturnType<typeof tonApi>; network?: NetworkJson } = {}
) {
  const fetchFn = tiServer(routes);
  const node = options.node ?? tonApi();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const ton = new TonProviderRouter(options.network ?? tonMainnet, {
    apiKey: 'tonapi-key',
    fetchFn,
    createTonApiClient: node.createTonApiClient,
    logger,
    ...options,
  });

  return { fetchFn, logger, node, ton };
}

const requestedPaths = (fetchFn: ReturnType<typeof tiServer>) =>
  fetchFn.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${new URL(input).pathname}`);

describe('TON provider selection', () => {
  it('serves TON mainnet from the registry node, and says so, while TI is the testnet indexer deployed today', async () => {
    const { fetchFn, logger, node, ton } = router(deployedTi);

    await expect(ton.getAccountBalance(ADDRESS)).resolves.toEqual({ balance: 42_000_000_000n, hasActivity: true });

    // TI is only asked to prove its network, through its own route; nothing is read from it, no TonAPI route is tried.
    expect(requestedPaths(fetchFn)).toEqual(['GET /api/indexer/v1/service-info']);
    expect(node.createTonApiClient).toHaveBeenCalledWith({ baseUrl: TONAPI, apiKey: 'tonapi-key' });
    expect(node.client.blockchain.getBlockchainMasterchainHead).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`using the registry node ${TONAPI} instead of TI`));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('service-info: ton_provider_request_failed: HTTP 404'));
    expect(UNIVERSAL_WALLET_TON_PROVIDER).toEqual({ indexerUrl: TI, registryNodeFallback: true });
  });

  it('reads from TI through its own routes once it proves TON mainnet, without the TonAPI key', async () => {
    const { fetchFn, logger, node, ton } = router(mainnetTi());

    await expect(ton.getAccountBalance(ADDRESS)).resolves.toEqual({ balance: 218_928_460_686n, hasActivity: true });

    expect(requestedPaths(fetchFn)).toEqual(['GET /api/indexer/v1/service-info', `GET ${BALANCE_PATH}`]);
    expect(JSON.stringify(fetchFn.mock.calls)).not.toContain('tonapi-key');
    expect(node.createTonApiClient).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(`[TON] TON Mainnet: using ${TI} (verified ton:mainnet)`);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['names TON testnet', { chainId: 'ton:testnet', network: 'testnet' }],
    ['names another host', { publicBaseUrl: 'https://indexer.example.com' }],
    ['is another service', { serviceId: 'si.soramitsu.io' }],
    ['cannot read balances', { capabilities: ['account-state', 'account-transactions', 'run-get-method'] }],
  ])('does not use TI when its service-info %s', async (_case, overrides) => {
    const { fetchFn, node, ton } = router(mainnetTi(overrides));

    await expect(ton.getAccountBalance(ADDRESS)).resolves.toMatchObject({ balance: 42_000_000_000n });

    expect(requestedPaths(fetchFn)).toEqual(['GET /api/indexer/v1/service-info']);
    expect(node.client.accounts.getAccount).toHaveBeenCalledOnce();
  });

  it('never shows a TI answer that names another network, and passes TI over for a while', async () => {
    const { fetchFn, logger, node, ton } = router({ ...mainnetTi(), [`GET ${BALANCE_PATH}`]: tiResponses.deployed.balance });

    // TI's "testnet" balance (218.9 TON) is dropped; the registry node answers instead.
    await expect(ton.getAccountBalance(ADDRESS)).resolves.toEqual({ balance: 42_000_000_000n, hasActivity: true });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('TI failed a request: ton_provider_network_mismatch'));

    await ton.getAccountBalance(ADDRESS);

    expect(requestedPaths(fetchFn)).toEqual(['GET /api/indexer/v1/service-info', `GET ${BALANCE_PATH}`]);
    expect(node.client.accounts.getAccount).toHaveBeenCalledTimes(2);
  });

  it('fails a TI answer for another network outright when the fallback is off', async () => {
    const { node, ton } = router(
      { ...mainnetTi(), [`GET ${BALANCE_PATH}`]: tiResponses.deployed.balance },
      { registryNodeFallback: false }
    );

    await expect(ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_network_mismatch' });
    expect(node.createTonApiClient).not.toHaveBeenCalled();
  });

  it('reports the provider as unavailable, never a balance, when nothing can be verified', async () => {
    const fallbackOff = router(deployedTi, { registryNodeFallback: false });
    await expect(fallbackOff.ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({
      code: 'ton_provider_unavailable',
      detail: expect.stringContaining('the registry node fallback is off'),
    });
    expect(fallbackOff.node.createTonApiClient).not.toHaveBeenCalled();

    // A registry node that serves TON testnet is not TON mainnet.
    const testnetNode = router(deployedTi, { node: tonApi({ globalId: -3 }) });
    const failure = await testnetNode.ton.getAccountBalance(ADDRESS).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TonProviderError);
    expect(failure).toMatchObject({ code: 'ton_provider_unavailable', detail: expect.stringContaining('global id -3') });
    expect(testnetNode.node.client.accounts.getAccount).not.toHaveBeenCalled();

    // A registry that lists TI as its TON node: TI is never addressed as a TonAPI server.
    const tiOnly = router(deployedTi, { network: { ...tonMainnet, nodes: [{ name: 'TI', url: TI }] } as NetworkJson });
    await expect(tiOnly.ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({
      code: 'ton_provider_unavailable',
      detail: expect.stringContaining('the registry lists no TON node'),
    });
    expect(tiOnly.node.createTonApiClient).not.toHaveBeenCalled();
  });

  it('waits before asking again after nothing could be verified', async () => {
    let now = 1_000;
    const { fetchFn, ton } = router(deployedTi, { registryNodeFallback: false, now: () => now });

    await expect(ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_unavailable' });
    await expect(ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_unavailable' });
    expect(fetchFn).toHaveBeenCalledOnce();

    now += 30_000;
    await expect(ton.getAccountBalance(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_unavailable' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('moves to TI on a later check once TI proves TON mainnet', async () => {
    let now = 1_000;
    let routes = deployedTi;
    const fetchFn = vi.fn((input: string, init?: RequestInit) => tiServer(routes)(input, init));
    const { node, ton } = router({}, { fetchFn, now: () => now });

    await expect(ton.getAccountBalance(ADDRESS)).resolves.toMatchObject({ balance: 42_000_000_000n });

    routes = mainnetTi();
    now += 4 * 60_000;
    await expect(ton.getAccountBalance(ADDRESS)).resolves.toMatchObject({ balance: 42_000_000_000n });

    now += 60_000;
    await expect(ton.getAccountBalance(ADDRESS)).resolves.toMatchObject({ balance: 218_928_460_686n });
    expect(node.client.accounts.getAccount).toHaveBeenCalledTimes(2);
  });

  it('sends only through a verified provider that accepts transactions', async () => {
    const boc = beginCell().storeUint(7, 8).endCell();

    // TI proves mainnet but is read-only: the verified registry node sends.
    const readOnlyTi = router(mainnetTi());
    const viaNode = await readOnlyTi.ton.broadcaster();
    expect(viaNode).toMatchObject({ source: 'registry-node', baseUrl: TONAPI });
    await viaNode.sendMessage(boc);
    expect(readOnlyTi.node.client.blockchain.sendBlockchainMessage).toHaveBeenCalledWith({ boc });

    // TI proves mainnet and accepts transactions: it sends through its own JSON-RPC route.
    const sendBoc = vi.fn(() => ({ status: 200, body: { id: 1, jsonrpc: '2.0', ok: true, result: { '@type': 'ok' } } }));
    const writableTi = router({ ...mainnetTi({ readOnly: false }), 'POST /api/v2/jsonRPC': sendBoc });
    const viaTi = await writableTi.ton.broadcaster();
    expect(viaTi).toMatchObject({ source: 'ti', baseUrl: TI });
    await viaTi.sendMessage(boc);
    expect(JSON.parse(String(writableTi.fetchFn.mock.calls.at(-1)![1]!.body))).toEqual({
      id: 1,
      jsonrpc: '2.0',
      method: 'sendBoc',
      params: { boc: boc.toBoc().toString('base64') },
    });
    expect(writableTi.node.createTonApiClient).not.toHaveBeenCalled();

    // Read-only TI and no fallback: nothing can be sent.
    const noFallback = router(mainnetTi(), { registryNodeFallback: false });
    await expect(noFallback.ton.broadcaster()).rejects.toMatchObject({ code: 'ton_broadcast_unavailable' });
    expect(noFallback.node.createTonApiClient).not.toHaveBeenCalled();
  });
});

describe('TON registry entries', () => {
  it('maps shipped and bundled TON chain ids to the network a provider must prove', () => {
    const testnet = (registrySnapshot as unknown as NetworkJson[]).find(({ name }) => name === 'TON Testnet')!;

    expect(tonNetworkKindOf(tonMainnet)).toBe('mainnet');
    expect(tonNetworkKindOf(testnet)).toBe('testnet');
    expect(tonNetworkKindOf({ name: 'TON Mainnet', chainId: 'ton:mainnet' } as NetworkJson)).toBe('mainnet');
    expect(tonNetworkKindOf({ name: 'TON', chainId: 'unknown', options: ['testnet'] } as NetworkJson)).toBe('testnet');
  });

  it('takes the registry node from the registry and never TI or a plain-http node', () => {
    expect(registryNodeUrlOf(tonMainnet, TI)).toBe(TONAPI);
    expect(registryNodeUrlOf({ nodes: [{ name: 'TI', url: `${TI}/` }, { name: 'node', url: TONAPI }] } as NetworkJson, TI)).toBe(TONAPI);
    expect(registryNodeUrlOf({ nodes: [{ name: 'plain', url: 'http://tonapi.io' }] } as NetworkJson, TI)).toBeUndefined();
    expect(registryNodeUrlOf({ nodes: [] as NetworkJson['nodes'] } as NetworkJson, TI)).toBeUndefined();
  });
});

describe('TonApiHandler', () => {
  it('sets up a provider for the network without contacting anything until it is used', async () => {
    const fetchFn = vi.fn();
    const handler = new TonApiHandler({} as State, { fetchFn });

    await expect(handler.initApi(tonMainnet)).resolves.toBe(true);

    expect(handler.api['ton mainnet'].api).toBeInstanceOf(TonProviderRouter);
    expect(handler.api['ton mainnet'].api).toMatchObject({ network: 'mainnet', networkName: 'TON Mainnet' });
    expect(fetchFn).not.toHaveBeenCalled();

    handler.destroyApi('TON Mainnet');
    expect(handler.api).toEqual({});
  });
});
