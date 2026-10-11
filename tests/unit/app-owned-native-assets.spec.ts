import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import BalanceService from '@extension-base/services/balance-service';
import SolanaBalanceService from '@extension-base/services/balance-service/SolanaBalanceService';
import { CoinGeckoService } from '@extension-base/services/prices-service/CoinGeckoService';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { SolanaWalletBalancesResponse } from '@extension-base/services/solana-indexer-service';
import { findTransferAssetGroup } from '@/helpers/currencies';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary } from '@/portfolio/assetIdentity';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
// The lookups under test are pure; the stores are only used by other exports of the module.
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

// The Bitcoin, Solana, TON and Iroha networks exactly as the runtime builds them from the bundled registry.
const networks = createUniversalWalletRegistryNetworks().map((network) => ({ ...network, active: !network.disabled }));
const networkMap = Object.fromEntries(networks.map((network) => [network.name, network])) as Record<string, NetworkJson>;
const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const ADDRESS = 'wallet-address';
// What CoinGecko answers for `ids=bitcoin,solana`; it knows no coin called "btc" or "sol".
const COINGECKO_PRICES = { bitcoin: 60_000, solana: 150 };

const loadedGroups = (ecosystem: WalletEcosystem, totals: Record<string, string>): TokenGroup[] => {
  const groups = getMockAssets(networkMap, ecosystem);
  groups.forEach(({ balances }) =>
    balances.forEach((balance) => {
      const total = totals[balance.name] ?? '0';
      Object.assign(balance, { state: APIItemState.READY, total, transferable: total });
    })
  );
  return groups;
};

describe('prices of the app-owned native assets', () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());

  it('gives BTC and SOL their coin ids on mainnet, and no price id on a test network', () => {
    const priceIds = Object.fromEntries(networks.map(({ name, assets }) => [name, assets[0]?.priceId]));

    expect(priceIds).toMatchObject({
      Bitcoin: 'bitcoin',
      Solana: 'solana',
      'Bitcoin Testnet': '',
      'Solana Devnet': '',
      'Taira Testnet': '',
    });
  });

  it('asks the price service for bitcoin and solana, never for a ticker', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { bitcoin: { usd: 60_000, usd_24h_change: 1 }, solana: { usd: 150, usd_24h_change: -2 } },
    });
    const state = {
      networkService: { assetsMap: networks.flatMap(({ assets }) => assets) },
      pricesService: { fiatSymbol: 'usd', prices: { json: { fiat: 'usd' } } },
    } as unknown as State;

    const prices = await new CoinGeckoService(state).fetchAssetsPrice();
    const ids = new URL(String(vi.mocked(axios.get).mock.calls[0][0])).searchParams.get('ids')!.split(',');

    expect(ids).toEqual(expect.arrayContaining(['bitcoin', 'solana']));
    expect(ids).not.toEqual(expect.arrayContaining(['btc']));
    expect(ids).not.toEqual(expect.arrayContaining(['sol']));
    expect(prices.tokenPriceMap).toMatchObject(COINGECKO_PRICES);
  });

  it('values a Bitcoin and a Solana holding in the list and in the header total', () => {
    const groups = [
      ...loadedGroups(WalletEcosystem.Bitcoin, { bitcoin: '0.5', 'bitcoin testnet': '3' }),
      ...loadedGroups(WalletEcosystem.Solana, { solana: '10' }),
    ];
    const input = { groups, networks, prices: COINGECKO_PRICES, addressForNetwork: () => ADDRESS };
    const rows = buildPortfolioSections({ ...input, preferences: {}, showTestnets: true }).flatMap(({ name, assets }) =>
      assets.map(({ symbol, fiatValue, isTestnet }) => ({ row: `${symbol}@${name}`, fiatValue, isTestnet }))
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        { row: 'BTC@Bitcoin', fiatValue: '30000', isTestnet: false },
        { row: 'SOL@Solana', fiatValue: '1500', isTestnet: false },
        // A test network has no price and is never counted.
        { row: 'BTC@Bitcoin Testnet', fiatValue: null, isTestnet: true },
      ])
    );
    expect(buildPortfolioSummary(input)).toMatchObject({ total: '31500', unpricedCount: 0 });
    // The lowercased tickers the rows used to ask for price nothing.
    expect(buildPortfolioSummary({ ...input, prices: { btc: 60_000, sol: 150 } })).toMatchObject({ total: '0', unpricedCount: 2 });
  });
});

describe('one SOL row per network', () => {
  const solanaResponse = (uiAmountString: string): SolanaWalletBalancesResponse => ({
    native: { decimals: 9, lamports: '0', mint: 'SOL', type: 'native', uiAmountString },
    syncedAt: 1,
    tokens: [],
    total: 1,
    wallet: WALLET,
  });

  function mockStorage() {
    let assetBalances = {};
    let networkScanStates = {};

    storageMock.get.mockImplementation(async () => ({
      assetBalances: structuredClone(assetBalances),
      networkScanStates: structuredClone(networkScanStates),
    }));
    storageMock.set.mockImplementation(async (value) => {
      if (value.assetBalances) assetBalances = structuredClone(value.assetBalances);
      if (value.networkScanStates) networkScanStates = structuredClone(value.networkScanStates);
    });
  }

  /** A background that just started, with the registry placeholders of the given wallet ecosystems. */
  function startBackground(ecosystems: WalletEcosystem[], getBalances: () => Promise<SolanaWalletBalancesResponse>) {
    const state = {
      networkService: {
        activeNetworkByEcosystem: { solana: [networkMap.Solana] },
        networkMap,
        networkValues: networks,
      },
      timeoutService: { lazyNext: (_key: string, callback: () => void) => callback() },
    } as unknown as State;
    const balanceService = new BalanceService(state);
    Object.assign(state, { balanceService });
    balanceService.balanceMap[ADDRESS] = ecosystems.flatMap((ecosystem) => getMockAssets(networkMap, ecosystem));

    return {
      balanceService,
      solana: new SolanaBalanceService(state, { getBalances }),
      // Storage writes are queued; an awaited write at the end of the queue has seen every earlier one.
      flush: () => balanceService.deleteBalanceStore('Solana', { id: 'never-cached' }, ADDRESS),
    };
  }

  const fetchSolana = (service: SolanaBalanceService) =>
    service.fetchBalance({ address: ADDRESS, solanaAddress: WALLET, networks: ['solana'] });
  const solRows = (groups: TokenGroup[]) =>
    buildPortfolioSections({ groups, networks, prices: COINGECKO_PRICES, preferences: {}, addressForNetwork: () => ADDRESS })
      .flatMap(({ assets }) => assets)
      .filter(({ symbol, networkName }) => symbol === 'SOL' && networkName === 'Solana');
  const solGroups = (groups: TokenGroup[]) =>
    groups.filter(({ balances }) => balances.some(({ id, name }) => id === 'SOL' && name.toLowerCase() === 'solana'));

  beforeEach(() => {
    storageMock.get.mockReset();
    storageMock.set.mockReset();
    mockStorage();
  });

  it('loads SOL into the registry placeholder instead of adding a second group', async () => {
    // The first session of a wallet with a Substrate and a Solana account.
    const { balanceService, solana } = startBackground(
      [WalletEcosystem.Substrate, WalletEcosystem.Solana],
      async () => solanaResponse('2.5')
    );
    const groups = balanceService.balanceMap[ADDRESS];
    const groupCount = groups.length;

    expect(solGroups(groups)).toEqual([expect.objectContaining({ relayChain: 'Solana' })]);
    await fetchSolana(solana);

    expect(groups).toHaveLength(groupCount);
    expect(solGroups(groups)).toHaveLength(1);
    expect(solRows(groups)).toEqual([expect.objectContaining({ balanceText: '2.5', fiatValue: '375', isReady: true })]);
    // Send resolves the loaded balance, not an empty placeholder.
    expect(findTransferAssetGroup(groups, 'SOL', 'Solana')?.balances[0]).toMatchObject({
      state: APIItemState.READY,
      transferable: '2.5',
    });
    // The devnet placeholder shares the asset id and is left alone.
    expect(groups.find(({ mainNetwork }) => mainNetwork === 'Solana Devnet')?.balances).toEqual([
      expect.objectContaining({ id: 'SOL', name: 'solana devnet', state: APIItemState.PENDING }),
    ]);
  });

  it('keeps one funded SOL row after a restart, counted once', async () => {
    const first = startBackground([WalletEcosystem.Solana], async () => solanaResponse('2.5'));
    await fetchSolana(first.solana);
    await first.flush();

    const restarted = startBackground([WalletEcosystem.Solana], async () => solanaResponse('3'));
    await restarted.balanceService.hydrateBalanceStorage([ADDRESS]);
    const groups = restarted.balanceService.balanceMap[ADDRESS];

    // The cached balance is back before the network answers.
    expect(solRows(groups)).toEqual([expect.objectContaining({ balanceText: '2.5' })]);
    await fetchSolana(restarted.solana);

    expect(solGroups(groups)).toHaveLength(1);
    expect(solRows(groups)).toEqual([expect.objectContaining({ balanceText: '3', fiatValue: '450' })]);
    expect(
      buildPortfolioSummary({ groups, networks, prices: COINGECKO_PRICES, addressForNetwork: () => ADDRESS }).total
    ).toBe('450');
  });

  it('keeps the cached SOL balance when the network cannot be reached after a restart', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = startBackground([WalletEcosystem.Solana], async () => solanaResponse('2.5'));
    await fetchSolana(first.solana);
    await first.flush();

    const restarted = startBackground([WalletEcosystem.Solana], async () => {
      throw new Error('solana_rpc_http_403');
    });
    await restarted.balanceService.hydrateBalanceStorage([ADDRESS]);
    await fetchSolana(restarted.solana);
    const groups = restarted.balanceService.balanceMap[ADDRESS];

    expect(solGroups(groups)).toHaveLength(1);
    expect(solGroups(groups)[0].balances[0]).toMatchObject({ state: APIItemState.ERROR, total: '2.5' });
    expect(solRows(groups)).toEqual([expect.objectContaining({ balanceText: '2.5', fiatValue: '375' })]);

    warn.mockRestore();
  });

  it('shows one row even if a second balance of the same asset and network slips in', () => {
    const placeholder = getMockAssets(networkMap, WalletEcosystem.Solana).find(({ mainNetwork }) => mainNetwork === 'Solana')!;
    const loaded: TokenGroup = {
      ...placeholder,
      relayChain: 'solana' as never,
      balances: [{ ...placeholder.balances[0], name: 'Solana', state: APIItemState.READY, total: '4', transferable: '4', timestamp: 2 }],
    };
    const stale: TokenGroup = {
      ...loaded,
      balances: [{ ...loaded.balances[0], total: '9', transferable: '9', timestamp: 1 }],
    };

    // The loaded balance wins over the placeholder whatever the order, and the newer of two loaded ones wins.
    [[placeholder, loaded], [loaded, placeholder], [stale, loaded, placeholder]].forEach((groups) => {
      expect(solRows(groups)).toEqual([expect.objectContaining({ balanceText: '4', fiatValue: '600' })]);
      expect(
        buildPortfolioSummary({ groups, networks, prices: COINGECKO_PRICES, addressForNetwork: () => ADDRESS }).total
      ).toBe('600');
    });
  });
});
