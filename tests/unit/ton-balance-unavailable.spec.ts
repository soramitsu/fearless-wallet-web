import { APIItemState } from '@extension-base/api/types/networks';
import { Address } from '@ton/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BalanceService from '@extension-base/services/balance-service';
import { TonApiHandler } from '@extension-base/services/network-service/handlers/TonApiHandler';
import { networkMap305, readSnapshot, TON_ADDRESS } from '../fixtures/legacy-305/generate';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import type { TonApiClientLike } from '@extension-base/services/ton-provider/RegistryNodeTonProvider';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary, splitZeroSections } from '@/portfolio/assetIdentity';
import { buildTokenRows, splitZeroTokenRows } from '@/portfolio/tokenLens';
import { buildCanonicalGroupIndex } from '@/portfolio/tokenGroups';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

// The networks a 3.0.5 build had, from the shipped chains/v13 registry: TON Mainnet's only node is tonapi.io.
const networkMap = networkMap305(readSnapshot());
const networks = Object.values(networkMap);
const tonMainnet = networkMap['TON Mainnet'];
const TON_PRICE = { 'the-open-network': 5 };
// TI as it answers today: no service-info route.
const deployedTi = async () => new Response(JSON.stringify(tiResponses.deployed.serviceInfo.body), { status: 404 });

type Node = { globalId: number; getAccount: () => Promise<unknown> };

// The background of a TON wallet on its first start after the update from 3.0.5. 3.0.5 kept balances under
// `balances`, which this build does not read, so there is no `assetBalances` cache to fall back on.
async function upgradedFrom305(node: Node) {
  let stored: Record<string, unknown> = { balances: { [TON_ADDRESS]: [{ symbol: 'ton', balance: '3.5' }] } };
  storageMock.get.mockImplementation(async () => structuredClone(stored));
  storageMock.set.mockImplementation(async (value: Record<string, unknown>) => {
    stored = { ...stored, ...structuredClone(value) };
  });

  const client = {
    accounts: {
      getAccount: vi.fn(node.getAccount),
      getAccountJettonsBalances: vi.fn(async () => ({ balances: [] })),
    },
    blockchain: { getBlockchainMasterchainHead: vi.fn(async () => ({ globalId: node.globalId })) },
  } as unknown as TonApiClientLike;
  const tonApiHandler = new TonApiHandler({} as State, {
    fetchFn: deployedTi,
    createTonApiClient: () => client,
    logger: { info: vi.fn(), warn: vi.fn() },
  });
  const state = {
    keyringService: {
      getAllMainAccounts: () => [{ address: TON_ADDRESS }],
      getSubstrateAddress: (address: string) => address,
      tonKeyring: { accountSubject: { value: { [TON_ADDRESS]: { walletContract: { address: Address.parse(TON_ADDRESS) } } } } },
    },
    networkService: { networkMap, networkValues: networks, networksGithub: networks, authoritativeDiscoveryNetworks: networks, tonApiHandler },
    pricesService: {
      fiatSymbol: 'usd',
      setPriceValue: vi.fn(),
      tonPricingService: { tonParseRates: vi.fn() },
      getPrice: (reply: (prices: { tokenPriceMap: Record<string, number>; tokenPriceChange: Record<string, number> }) => void) =>
        reply({ tokenPriceMap: TON_PRICE, tokenPriceChange: {} }),
    },
    timeoutService: { lazyNext: vi.fn() },
    get getTonApiMap() {
      return tonApiHandler.api;
    },
  } as unknown as State;
  const service = new BalanceService(state);
  (state as unknown as { balanceService: BalanceService }).balanceService = service;

  service.generateDefaultBalance(TON_ADDRESS, WalletEcosystem.Ton);
  await service.hydrateBalanceStorage([TON_ADDRESS]);
  await tonApiHandler.initApi(tonMainnet);

  const refresh = async () => {
    await service.tonBalanceService.fetchBalance(TON_ADDRESS, ['ton mainnet']);
    await vi.waitFor(() => expect((stored.networkScanStates as Record<string, unknown>)?.[TON_ADDRESS]).toBeDefined());

    const scanStates = (stored.networkScanStates as Record<string, Record<string, never>>)[TON_ADDRESS];
    const input = {
      groups: service.balanceMap[TON_ADDRESS],
      networks,
      prices: TON_PRICE,
      preferences: {},
      addressForNetwork: () => TON_ADDRESS,
      scanStates,
      walletScope: (network: NetworkJson) => network.ecosystem === 'ton',
    };

    return { input, sections: buildPortfolioSections(input) };
  };

  return { client, refresh, service };
}

const tonRow = (sections: ReturnType<typeof buildPortfolioSections>) =>
  sections.find(({ name }) => name === 'TON Mainnet')?.assets.find(({ symbol }) => symbol === 'TON');

// The By token lens, which 4.2.0 opens by default, over the same sections.
const groupIndex = buildCanonicalGroupIndex({ networks });
const tonTokenRow = (sections: ReturnType<typeof buildPortfolioSections>) =>
  buildTokenRows({ sections, index: groupIndex }).find(({ symbol }) => symbol === 'TON');

describe('TON balance of a wallet updated from 3.0.5', () => {
  beforeEach(() => {
    storageMock.get.mockReset();
    storageMock.set.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('comes from the registry node, as in 3.0.5, while TI answers as testnet', async () => {
    const { refresh } = await upgradedFrom305({
      globalId: -239,
      getAccount: async () => ({ balance: 3_500_000_000n, status: 'active' }),
    });

    const { input, sections } = await refresh();

    expect(tonRow(sections)).toMatchObject({ balanceText: '3.5', hasBalance: true, isReady: true, fiatValue: '17.5' });
    expect(tonRow(sections)?.balanceUnavailable).toBe(false);
    expect(buildPortfolioSummary(input)).toMatchObject({ total: '17.5', unavailableCount: 0 });
    expect(tonTokenRow(sections)).toMatchObject({ balanceText: '3.5', fiatValue: '17.5', balanceUnavailable: false, balanceFailed: false });
  });

  it('says the balance failed, never 0, when no provider proves TON mainnet', async () => {
    // The registry node serves TON testnet, and TI has no service-info: nothing is read from either.
    const { client, refresh, service } = await upgradedFrom305({
      globalId: -3,
      getAccount: async () => ({ balance: 0n, status: 'nonexist' }),
    });

    const { input, sections } = await refresh();
    const section = sections.find(({ name }) => name === 'TON Mainnet')!;

    expect(client.accounts.getAccount).not.toHaveBeenCalled();
    expect(tonRow(sections)).toMatchObject({ balanceUnavailable: true, hasBalance: false, isReady: false });
    expect(section.error).toBe('balance_scan_failed');
    // Not folded into "No balance · N networks", not counted, and not dropped by the hide-zero filter.
    expect(splitZeroSections(sections).funded.map(({ name }) => name)).toEqual(['TON Mainnet']);
    // The header and the wallet list know their total leaves the TON balance out, and say so.
    expect(buildPortfolioSummary(input)).toMatchObject({ total: '0', unavailableCount: 1 });
    expect(await service.getTotalBalances(null)).toEqual([expect.objectContaining({ total: '0', unavailableCount: 1 })]);
    expect(tonRow(buildPortfolioSections({ ...input, hideZero: true }))).toMatchObject({ balanceUnavailable: true });
    // Hidden TON (by the user, or a 3.0.5 hide the migration kept because TON was funded) is still in the wallet
    // list total, so that total still says it leaves the failed balance out.
    const hiddenKeysByAddress = { [TON_ADDRESS]: [tonRow(sections)!.key] };
    expect(await service.getTotalBalances({ hiddenKeysByAddress })).toEqual([
      expect.objectContaining({ total: '0', visibleTotal: '0', unavailableCount: 1 }),
    ]);

    // The By token lens says the same: a row that failed, with the funded rows, not "0 TON" under "no balance".
    const row = tonTokenRow(sections)!;
    expect(row).toMatchObject({ balanceUnavailable: true, unavailableNetworkCount: 1, hasBalance: false, fiatValue: null });
    expect(splitZeroTokenRows([row]).funded).toEqual([row]);
  });

  it('keeps the last confirmed balance, marked as failed, when the provider stops answering', async () => {
    let answer: () => Promise<unknown> = async () => ({ balance: 3_500_000_000n, status: 'active' });
    const { refresh } = await upgradedFrom305({ globalId: -239, getAccount: () => answer() });
    await refresh();

    answer = async () => {
      throw new Error('503 Service Unavailable');
    };
    const { sections } = await refresh();

    expect(tonRow(sections)).toMatchObject({ balanceText: '3.5', hasBalance: true, isReady: false, balanceUnavailable: false });
    expect(sections.find(({ name }) => name === 'TON Mainnet')).toMatchObject({ stale: true, error: 'balance_scan_failed' });
    // By token has no network header to say so; the row itself is marked as out of date.
    expect(tonTokenRow(sections)).toMatchObject({ balanceText: '3.5', balanceUnavailable: false, balanceFailed: true });
  });

  it('marks the balance item as failed without an amount in the background', async () => {
    const { refresh } = await upgradedFrom305({ globalId: -3, getAccount: async () => ({ balance: 0n, status: 'nonexist' }) });

    const { input } = await refresh();
    const item = input.groups.flatMap(({ balances }) => balances).find(({ name, symbol }) => name === 'ton mainnet' && symbol === 'ton');

    expect(item).toMatchObject({ state: APIItemState.ERROR });
    expect(item?.total).toBeUndefined();
    expect(item?.transferable).toBeUndefined();
  });
});
