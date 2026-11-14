import { Interface, JsonRpcProvider } from 'ethers';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { EVM_TOKEN_DIRECT_READ_LIMIT } from '@extension-base/services/balance-service/EvmBalanceService';
import EvmContractService, { REFRESH_TIME } from '@extension-base/services/evm-contract-service';
import {
  EVM_TOKEN_SCAN_INTERVAL_MS,
  EVM_TOKEN_SCAN_RETRY_MS,
  EvmTokenDiscoveryService,
} from '@extension-base/services/evm-token-discovery';
import { MULTICALL3_ADDRESS } from '@extension-base/services/evm-token-discovery/multicall';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { BALANCE_POLL_MS, SubscriptionService } from '@extension-base/services/subscription-service';
import { TimeoutService } from '@extension-base/services/timeout-service';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { ServiceInfo } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { JsonRpcPayload, JsonRpcResult } from 'ethers';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary, createAssetKey } from '@/portfolio/assetIdentity';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION_SMOKE: false,
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const NODE = 'https://node.test/';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const E18 = 10n ** 18n;

const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
]);
const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;

function ethereum(extraAssets: NetworkJson['assets'] = []): NetworkJson {
  return {
    name: 'Ethereum',
    chainId: '1',
    ecosystem: 'ethereum',
    icon: 'https://example.test/ethereum.svg',
    options: ['ethereum'],
    active: true,
    currentProvider: NODE,
    customNodes: [],
    nodes: [{ name: 'node', url: NODE }],
    assets: [
      { id: 'eth-utility', symbol: 'eth', name: 'ethereum', precision: 18, isUtility: true, priceId: 'ethereum' },
      { id: USDT, symbol: 'usdt', name: 'tether usd', precision: 6, priceId: 'tether' },
      ...extraAssets,
    ],
  } as unknown as NetworkJson;
}

const LIST_TOKENS = [
  [UNI, 'UNI', 'Uniswap', 18],
  [LINK, 'LINK', 'ChainLink Token', 18],
  [PEPE, 'PEPE', 'Pepe', 18],
  // A registry asset on the list: the registry path reads it.
  [USDT, 'USDT', 'Tether USD', 6],
];

const listFiles = (tokens: unknown[] = LIST_TOKENS): Record<string, unknown> => ({
  'index.json': { format: 'fearless-evm-token-lists', version: 1, lists: { 1: { tokens: tokens.length } } },
  '1.json': { format: 'fearless-evm-token-list', version: 1, chainId: '1', network: 'Ethereum', tokens },
});

/** The chain as one node answers it, and what the wallet asked. */
interface Chain {
  native: bigint;
  holdings: Record<string, bigint>;
  hasMulticall: boolean;
  multicallFails: boolean;
  /** The tokens of each aggregate3 the wallet sent. */
  multicalls: string[][];
  /** The tokens read with a balanceOf call of their own. */
  direct: string[];
  /** eth_getCode lookups of Multicall3. */
  codeLookups: number;
  /** How long the node takes to answer an aggregate3, and how many were being answered at once at most. */
  multicallDelayMs: number;
  inFlight: number;
  mostInFlight: number;
  /** Runs before each of the next `replacements` aggregate3 calls, which then fail as calls on a replaced provider do. */
  replaceProvider?: () => void;
  replacements: number;
}

function chainOf(holdings: Record<string, bigint> = {}): Chain {
  return {
    native: 2n * E18,
    holdings: Object.fromEntries(Object.entries(holdings).map(([token, amount]) => [token.toLowerCase(), amount])),
    hasMulticall: true,
    multicallFails: false,
    multicalls: [],
    direct: [],
    codeLookups: 0,
    replacements: 0,
    multicallDelayMs: 0,
    inFlight: 0,
    mostInFlight: 0,
  };
}

function answerAsTheNodeDoes(chain: Chain) {
  vi.spyOn(JsonRpcProvider.prototype, '_send').mockImplementation(async (payload: JsonRpcPayload | JsonRpcPayload[]) => {
    const requests = Array.isArray(payload) ? payload : [payload];
    // ethers sends calls made together as one batch: each aggregate3 in it is one more being answered at once.
    const lists = requests.filter(({ method, params }) =>
      method === 'eth_call' && (params as [{ to?: string }])?.[0]?.to?.toLowerCase() === MULTICALL3_ADDRESS.toLowerCase()).length;

    if (lists && chain.multicallDelayMs) {
      chain.inFlight += lists;
      chain.mostInFlight = Math.max(chain.mostInFlight, chain.inFlight);
      await new Promise((resolve) => setTimeout(resolve, chain.multicallDelayMs));
      chain.inFlight -= lists;
    }

    return requests.map(({ id, method, params }) => {
      const [first] = (params ?? []) as [Record<string, string> | string];
      const result = (value: string) => ({ id, result: value }) as JsonRpcResult;

      if (method === 'eth_chainId') return result('0x1');
      if (method === 'eth_getBalance') return result(word(chain.native));
      if (method === 'eth_getCode') {
        chain.codeLookups += 1;
        return result(chain.hasMulticall && first === MULTICALL3_ADDRESS.toLowerCase() ? '0x6080' : '0x');
      }
      if (method !== 'eth_call' || typeof first !== 'object') throw new Error(`unexpected ${method}`);

      const to = first.to.toLowerCase();

      if (to !== MULTICALL3_ADDRESS.toLowerCase()) {
        chain.direct.push(to);
        return result(word(chain.holdings[to] ?? 0n));
      }

      const [calls] = multicall.decodeFunctionData('aggregate3', first.data) as unknown as [{ target: string }[]];
      chain.multicalls.push(calls.map(({ target }) => target.toLowerCase()));
      if (chain.multicallFails) return { id, error: { code: -32603, message: 'internal error' } } as unknown as JsonRpcResult;
      if (chain.replacements > 0 && chain.replaceProvider) {
        chain.replacements -= 1;
        chain.replaceProvider();
        return { id, error: { code: -32603, message: 'internal error' } } as unknown as JsonRpcResult;
      }

      return result(
        multicall.encodeFunctionResult('aggregate3', [
          calls.map(({ target }) => ({ success: true, returnData: word(chain.holdings[target.toLowerCase()] ?? 0n) })),
        ])
      );
    });
  });
}

type Stored = Record<string, unknown>;

function storageOf(stored: Stored = {}) {
  storageMock.get.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, structuredClone(stored[key])]))
  );
  storageMock.set.mockImplementation(async (value: Stored) => {
    Object.entries(value).forEach(([key, item]) => {
      stored[key] = structuredClone(item);
    });
  });

  return stored;
}

function walletWith({
  network = ethereum(),
  files = listFiles(),
  stored = storageOf(),
  wallets = [WALLET],
}: { network?: NetworkJson; files?: Record<string, unknown>; stored?: Stored; wallets?: string[] } = {}) {
  const handler = new EvmApiHandler({ [network.name]: network });
  const fetchListFile = vi.fn(async (name: string) => files[name]);
  const state = {
    isReady: () => true,
    currentAccount: { address: WALLET, ethereumAddress: WALLET, walletEcosystem: WalletEcosystem.Evm, name: 'EVM', isMobile: false },
    getEvmApi: (name: string) => handler.getApi(name),
    getSubstrateApiMap: {},
    keyringService: {
      getAllMainAccounts: () => wallets.map((address) => ({ address, meta: { walletEcosystem: WalletEcosystem.Evm, ethereumAddress: address } })),
      getSubstrateAddress: (address: string) => address,
    },
    networkService: {
      networkValues: [network],
      networkMap: { [network.name]: network },
      evmApiHandler: handler,
      activeNetworkByEcosystem: {
        substrate: [], substrateList: [], evm: [network], evmList: ['ethereum'], tonList: [], solanaList: [], bitcoinList: [], irohaList: [],
      },
    },
    evmContractService: new EvmContractService(),
    evmTokenDiscoveryService: new EvmTokenDiscoveryService({
      fetchListFile,
      readState: async () => structuredClone(stored.evmTokenDiscovery),
      writeState: async (evmTokenDiscovery) => {
        stored.evmTokenDiscovery = structuredClone(evmTokenDiscovery);
      },
    }),
  } as Record<string, unknown>;

  state.timeoutService = new TimeoutService(state as unknown as State);
  const balanceService = new BalanceService(state as unknown as State);
  state.balanceService = balanceService;
  wallets.forEach((address) => balanceService.generateDefaultBalance(address, WalletEcosystem.Evm));
  handler.initEvmApi(network);

  const read = (options: { force?: boolean; assetId?: string; ethereumAddress?: string } = {}) =>
    balanceService.evmBalanceService.fetchBalance({ networks: ['ethereum'], ethereumAddress: WALLET, ...options });
  const balances = () => (balanceService.balanceMap[WALLET] ?? []).flatMap(({ balances: items }) => items);
  const found = (token: string): BalanceItem | undefined =>
    balances().find(({ id, assetMetadataSource }) => assetMetadataSource === 'tokenList' && id.toLowerCase() === token.toLowerCase());

  return { state, balanceService, handler, read, balances, found, fetchListFile, stored, network };
}

const UNI_KEY = createAssetKey({ ecosystem: 'ethereum', chainId: '1', assetId: UNI });

let now = Date.UTC(2026, 10, 13, 12);
const later = (ms: number) => {
  now += ms;
  vi.setSystemTime(now);
};

beforeEach(() => {
  now = Date.UTC(2026, 10, 13, 12);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  storageMock.get.mockReset();
  storageMock.set.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ERC-20 tokens outside the registry', () => {
  it('are found on the first read, unverified, never priced or counted, and saved', async () => {
    const chain = chainOf({ [UNI]: 5n * E18, [USDT]: 3_000_000n });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();

    await wallet.read();

    expect(wallet.found(UNI)).toMatchObject({
      id: UNI,
      symbol: 'UNI',
      tokenName: 'Uniswap',
      precision: 18,
      total: '5.0',
      transferable: '5.0',
      type: 'erc20',
      state: APIItemState.READY,
      assetMetadataTrust: 'unverified',
      assetMetadataSource: 'tokenList',
      relayChain: 'ethereum',
    });
    // Nothing is added for a token the wallet does not hold, and the registry's USDT is read as the registry's.
    expect(wallet.found(LINK)).toBeUndefined();
    expect(wallet.found(PEPE)).toBeUndefined();
    expect(wallet.found(USDT)).toBeUndefined();
    expect(chain.multicalls).toEqual([[UNI, LINK, PEPE].map((token) => token.toLowerCase())]);
    expect(wallet.balances().find(({ id }) => id === USDT)).toMatchObject({ total: '3.0', assetMetadataTrust: 'verified' });

    // Cached for the next start, and the list is not read again before a day has passed.
    const stored = wallet.stored.assetBalances as Record<string, Record<string, BalanceItem>>;
    expect(stored[WALLET][UNI_KEY]).toMatchObject({ id: UNI, total: '5.0', assetMetadataSource: 'tokenList', tokenName: 'Uniswap' });
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });

    // The portfolio lists it as found, with no price and outside the total.
    const sections = buildPortfolioSections({
      groups: wallet.balanceService.balanceMap[WALLET],
      networks: [wallet.network],
      prices: { ethereum: 3000, tether: 1, uniswap: 10 },
      preferences: {},
      addressForNetwork: () => WALLET,
    });
    const uni = sections.flatMap(({ detectedAssets }) => detectedAssets).find(({ assetId }) => assetId === UNI);
    expect(uni).toMatchObject({ trust: 'unverified', source: 'tokenList', fiatValue: null, symbol: 'UNI', name: 'Uniswap', icon: '' });
    const summary = buildPortfolioSummary({
      groups: wallet.balanceService.balanceMap[WALLET],
      networks: [wallet.network],
      prices: { ethereum: 3000, tether: 1, uniswap: 10 },
      addressForNetwork: () => WALLET,
    });
    expect(Number(summary.total)).toBe(2 * 3000 + 3);
  });

  it('are read again on every later read, and the whole list once a day, when a token gone is removed', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    await wallet.read();

    chain.holdings[UNI.toLowerCase()] = 7n * E18;
    chain.multicalls.length = 0;
    later(REFRESH_TIME);
    await wallet.read();
    expect(chain.multicalls).toEqual([[UNI.toLowerCase()]]);
    expect(wallet.found(UNI)).toMatchObject({ total: '7.0', state: APIItemState.READY });

    // Sold: it reads 0 at once and stays until the next complete read of the list.
    chain.holdings[UNI.toLowerCase()] = 0n;
    later(REFRESH_TIME);
    await wallet.read();
    expect(wallet.found(UNI)).toMatchObject({ total: '0.0' });

    chain.multicalls.length = 0;
    later(EVM_TOKEN_SCAN_INTERVAL_MS);
    await wallet.read();
    expect(chain.multicalls).toEqual([[UNI, LINK, PEPE].map((token) => token.toLowerCase())]);
    expect(wallet.found(UNI)).toBeUndefined();
    expect((wallet.stored.assetBalances as Record<string, Record<string, unknown>>)[WALLET][UNI_KEY]).toBeUndefined();
  });

  it('find a token received after the first read at the next daily read, or on Refresh after five minutes', async () => {
    const chain = chainOf();
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    await wallet.read();
    expect(wallet.found(LINK)).toBeUndefined();

    chain.holdings[LINK.toLowerCase()] = E18 / 2n;
    later(REFRESH_TIME);
    await wallet.read({ force: true });
    expect(wallet.found(LINK)).toBeUndefined();

    later(5 * 60_000);
    await wallet.read({ force: true });
    expect(wallet.found(LINK)).toMatchObject({ total: '0.5', symbol: 'LINK', tokenName: 'ChainLink Token' });
  });

  it('keep the last amount, marked failed, when a read of them fails', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    await wallet.read();

    chain.multicallFails = true;
    later(REFRESH_TIME);
    await wallet.read();

    expect(wallet.found(UNI)).toMatchObject({ total: '5.0', state: APIItemState.ERROR });
  });

  it('never make the network not responding when the list cannot be read, and try the list again ten minutes later', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    chain.multicallFails = true;
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();

    await wallet.read();

    expect(wallet.found(UNI)).toBeUndefined();
    expect(wallet.balances().find(({ id }) => id === 'eth-utility')).toMatchObject({ total: '2.0', state: APIItemState.READY });
    expect(wallet.balanceService.networkScanStates[WALLET].Ethereum).toMatchObject({ stale: false });
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { failedAt: now } } } });

    chain.multicallFails = false;
    chain.multicalls.length = 0;
    later(EVM_TOKEN_SCAN_RETRY_MS - 60_000);
    await wallet.read();
    expect(chain.multicalls).toEqual([]);

    later(60_000);
    await wallet.read();
    expect(wallet.found(UNI)).toMatchObject({ total: '5.0' });
  });

  it('are not read from a list that is missing or unreadable, and the read is tried again later', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const files: Record<string, unknown> = { ...listFiles(), '1.json': { format: 'something else' } };
    const wallet = walletWith({ files });

    await wallet.read();
    expect(chain.multicalls).toEqual([]);
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { failedAt: now } } } });

    // A network the index does not name has no list: its read is done, with nothing to read.
    const unlisted = walletWith({ files: { 'index.json': { format: 'fearless-evm-token-lists', version: 1, lists: {} } } });
    await unlisted.read();
    expect(unlisted.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });
    expect(unlisted.fetchListFile.mock.calls.map(([name]) => name)).toEqual(['index.json']);
  });

  it('come back from the cache at start, with their names, and are read again without reading the list', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const first = walletWith();
    await first.read();

    const restarted = walletWith({ stored: storageOf(first.stored) });
    await restarted.balanceService.hydrateBalanceStorage([WALLET]);

    expect(restarted.found(UNI)).toMatchObject({ total: '5.0', symbol: 'UNI', tokenName: 'Uniswap', assetMetadataTrust: 'unverified' });
    expect(restarted.balanceService.balanceMap[WALLET].find(({ groupId }) => groupId === UNI)).toMatchObject({
      tokenName: 'Uniswap',
      icon: '',
      relayChain: 'ethereum',
    });

    chain.holdings[UNI.toLowerCase()] = 6n * E18;
    chain.multicalls.length = 0;
    later(60_000);
    await restarted.read();
    expect(chain.multicalls).toEqual([[UNI.toLowerCase()]]);
    expect(restarted.fetchListFile).not.toHaveBeenCalled();
    expect(restarted.found(UNI)).toMatchObject({ total: '6.0' });
  });

  it('become the registry asset, verified, once the registry lists them', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const first = walletWith();
    await first.read();

    // While the wallet runs: the found row becomes the registry's row, which the registry path reads.
    first.network.assets.push({ id: UNI.toLowerCase(), symbol: 'uni', name: 'uniswap', precision: 18, priceId: 'uniswap' } as NetworkJson['assets'][number]);
    chain.holdings[UNI.toLowerCase()] = 6n * E18;
    chain.multicalls.length = 0;
    later(REFRESH_TIME);
    await first.read();
    expect(first.found(UNI)).toBeUndefined();
    expect(first.balances().filter(({ id }) => id.toLowerCase() === UNI.toLowerCase())).toEqual([
      expect.objectContaining({ id: UNI.toLowerCase(), total: '6.0', state: APIItemState.READY, assetMetadataTrust: 'verified', priceId: 'uniswap' }),
    ]);
    expect(chain.direct).toContain(UNI.toLowerCase());
    expect(chain.multicalls).toEqual([]);
    expect(first.balanceService.balanceMap[WALLET].find(({ groupId }) => groupId === UNI.toLowerCase())).toMatchObject({
      symbol: 'uni',
      tokenName: 'uniswap',
      priceId: 'uniswap',
    });

    // A wallet that has the registry's row already keeps that one, and the found row goes.
    const universal = walletWith({ network: ethereum() });
    await universal.read();
    universal.network.assets.push({ id: UNI.toLowerCase(), symbol: 'uni', name: 'uniswap', precision: 18, priceId: 'uniswap' } as NetworkJson['assets'][number]);
    universal.balanceService.balanceMap[WALLET].push({
      balances: [{ id: UNI.toLowerCase(), name: 'ethereum', symbol: 'uni', precision: 18, type: 'erc20', icon: '', state: APIItemState.PENDING, assetMetadataTrust: 'verified', assetMetadataSource: 'registry' }],
      groupId: UNI.toLowerCase(),
      icon: '',
      mainNetwork: 'Ethereum',
      providers: [],
      relayChain: 'ethereum',
      symbol: 'uni',
      tokenName: 'uniswap',
    });
    later(REFRESH_TIME);
    await universal.read();
    expect(universal.found(UNI)).toBeUndefined();
    expect(universal.balances().filter(({ id }) => id.toLowerCase() === UNI.toLowerCase())).toEqual([
      expect.objectContaining({ id: UNI.toLowerCase(), total: '6.0', assetMetadataTrust: 'verified' }),
    ]);

    // After a restart: the cached row is restored as the registry's asset, under the registry's id.
    const network = ethereum([{ id: UNI.toLowerCase(), symbol: 'uni', name: 'uniswap', precision: 18, priceId: 'uniswap' } as NetworkJson['assets'][number]]);
    const stored = storageOf({
      assetBalances: {
        [WALLET]: {
          [UNI_KEY]: { chain: 'Ethereum', id: UNI, name: 'Ethereum', symbol: 'UNI', tokenName: 'Uniswap', precision: 18, type: 'erc20', icon: '', total: '5.0', transferable: '5.0', state: APIItemState.READY, assetMetadataTrust: 'unverified', assetMetadataSource: 'tokenList' },
        },
      },
    });
    const restarted = walletWith({ network, stored });
    await restarted.balanceService.hydrateBalanceStorage([WALLET]);

    expect(restarted.found(UNI)).toBeUndefined();
    expect(restarted.balances().filter(({ id }) => id.toLowerCase() === UNI.toLowerCase())).toEqual([
      expect.objectContaining({ id: UNI.toLowerCase(), total: '5.0', assetMetadataTrust: 'verified', assetMetadataSource: 'registry' }),
    ]);
    expect(restarted.balances().find(({ id }) => id === UNI.toLowerCase())).not.toHaveProperty('tokenName');
  });

  it('are read one call each on a network without Multicall3, unless the list is long', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    chain.hasMulticall = false;
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();

    await wallet.read();
    expect(wallet.found(UNI)).toMatchObject({ total: '5.0' });
    expect(chain.multicalls).toEqual([]);
    expect(chain.direct.sort()).toEqual([UNI, LINK, PEPE, USDT].map((token) => token.toLowerCase()).sort());

    const long = Array.from({ length: EVM_TOKEN_DIRECT_READ_LIMIT + 1 }, (_, index) => [
      `0x${(index + 1).toString(16).padStart(40, '0')}`,
      `T${index}`,
      `Token ${index}`,
      18,
    ]);
    const longChain = chainOf();
    longChain.hasMulticall = false;
    vi.restoreAllMocks();
    answerAsTheNodeDoes(longChain);
    const longList = walletWith({ files: listFiles(long) });
    await longList.read();
    expect(longChain.direct).toEqual([USDT]);
    expect(longList.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });
  });

  it('are read on the new provider when the network’s provider is replaced during the read, even twice', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    const first = wallet.handler.getApi('Ethereum')?.api;
    // A failover or a change of the networks followed rebuilds the provider while the list is being read.
    chain.replaceProvider = () => wallet.handler.initEvmApi(wallet.network);
    chain.replacements = 2;

    await wallet.read();

    expect(wallet.handler.getApi('Ethereum')?.api).not.toBe(first);
    expect(chain.multicalls).toHaveLength(3);
    expect(wallet.found(UNI)).toMatchObject({ total: '5.0' });
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });

    // A call that fails on the provider it was sent to, with no new provider since, is not asked again.
    chain.multicallFails = true;
    chain.multicalls.length = 0;
    later(REFRESH_TIME);
    await wallet.read();
    expect(chain.multicalls).toHaveLength(1);
  });

  it('are not marked failed when the provider keeps being replaced, and the next read reads the list again', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    chain.replaceProvider = () => wallet.handler.initEvmApi(wallet.network);
    chain.replacements = 3;

    await wallet.read();

    expect(chain.multicalls).toHaveLength(3);
    expect(wallet.found(UNI)).toBeUndefined();
    expect(wallet.stored.evmTokenDiscovery).toBeUndefined();

    later(REFRESH_TIME);
    await wallet.read();
    expect(wallet.found(UNI)).toMatchObject({ total: '5.0' });
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });

    // Found tokens keep their state too while a read is cut short that way.
    chain.replacements = 3;
    later(REFRESH_TIME);
    await wallet.read();
    expect(wallet.found(UNI)).toMatchObject({ total: '5.0', state: APIItemState.READY });
  });

  it('are found for every wallet, one wallet’s list read on a network at a time', async () => {
    const SECOND = '0x2222222222222222222222222222222222222222';
    const chain = chainOf({ [UNI]: 5n * E18 });
    chain.multicallDelayMs = 30;
    answerAsTheNodeDoes(chain);
    const wallet = walletWith({ wallets: [WALLET, SECOND] });

    await Promise.all([wallet.read(), wallet.read({ ethereumAddress: SECOND })]);

    expect(chain.multicalls).toHaveLength(2);
    expect(chain.mostInFlight).toBe(1);
    // The node answers the same balances for both addresses here: each wallet has its own row.
    const holders = Object.entries(wallet.balanceService.balanceMap)
      .filter(([, groups]) => groups.some(({ balances }) => balances.some(({ assetMetadataSource }) => assetMetadataSource === 'tokenList')))
      .map(([address]) => address)
      .sort();
    expect(holders).toEqual([WALLET, SECOND]);
  });

  it('do not ask the node of a network that has no list anything more', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith({ files: { 'index.json': { format: 'fearless-evm-token-lists', version: 1, lists: { 56: {} } } } });

    await wallet.read();

    expect(chain.codeLookups).toBe(0);
    expect(chain.multicalls).toEqual([]);
    expect(wallet.stored.evmTokenDiscovery).toEqual({ version: 1, scans: { [WALLET]: { 1: { scannedAt: now } } } });
  });

  it('are read alone when one of them is refreshed', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    await wallet.read();

    chain.holdings[UNI.toLowerCase()] = 8n * E18;
    chain.multicalls.length = 0;
    chain.direct.length = 0;
    later(EVM_TOKEN_SCAN_INTERVAL_MS);
    await wallet.read({ assetId: UNI.toLowerCase(), force: true });

    expect(chain.multicalls).toEqual([[UNI.toLowerCase()]]);
    expect(chain.direct).toEqual([]);
    expect(wallet.found(UNI)).toMatchObject({ total: '8.0' });
    // A token the wallet has not found is not read on its own.
    await expect(wallet.read({ assetId: PEPE, force: true })).resolves.toEqual([]);
  });

  it('are read again by the poll while a wallet page is open', async () => {
    const chain = chainOf({ [UNI]: 5n * E18 });
    answerAsTheNodeDoes(chain);
    const wallet = walletWith();
    const state = wallet.state;
    Object.assign(state, {
      requestService: { mutateAuthorizations: vi.fn().mockResolvedValue(undefined) },
      serviceInfoSubject: new Subject<ServiceInfo>(),
      cronService: { updateCron: vi.fn() },
      nftService: { publishNfts: vi.fn() },
    });
    const subscriptions = new SubscriptionService(state as unknown as State);

    await subscriptions.start();
    (state.serviceInfoSubject as Subject<ServiceInfo>).next({
      currentAccountInfo: state.currentAccount,
      apiMap: { substrate: {}, evm: { ethereum: {} }, ton: {} },
    } as unknown as ServiceInfo);
    await vi.waitFor(() => expect(wallet.found(UNI)).toMatchObject({ total: '5.0' }), { timeout: 5000 });

    chain.holdings[UNI.toLowerCase()] = 9n * E18;
    chain.multicalls.length = 0;
    // Not yet due: the poll reads nothing.
    await expect(subscriptions.refreshCurrentWallet()).resolves.toBe(true);
    expect(chain.multicalls).toEqual([]);

    // vi.waitFor moved the clock on while it waited, so the poll interval is counted from now.
    later(BALANCE_POLL_MS[WalletEcosystem.Evm] + 1_000);
    await expect(subscriptions.refreshCurrentWallet()).resolves.toBe(true);

    expect(chain.multicalls).toEqual([[UNI.toLowerCase()]]);
    expect(wallet.found(UNI)).toMatchObject({ total: '9.0', state: APIItemState.READY });
    subscriptions.stop();
  });

  it('are left alone for a wallet that does not exist', () => {
    const wallet = walletWith();

    wallet.balanceService.setEvmTokenBalanceItem('Ethereum', { id: UNI, symbol: 'UNI', precision: 18, state: APIItemState.READY, total: '1.0' }, '0x2222222222222222222222222222222222222222');
    // Nothing is added for a failed read or a zero balance either.
    wallet.balanceService.setEvmTokenBalanceItem('Ethereum', { id: UNI, symbol: 'UNI', precision: 18, state: APIItemState.ERROR }, WALLET);
    wallet.balanceService.setEvmTokenBalanceItem('Ethereum', { id: UNI, symbol: 'UNI', precision: 18, state: APIItemState.READY, total: '0.0' }, WALLET);
    wallet.balanceService.removeEvmTokenBalanceItem('Ethereum', UNI, WALLET);

    expect(wallet.found(UNI)).toBeUndefined();
    expect(storageMock.set).not.toHaveBeenCalled();
  });
});
