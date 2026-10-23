import { FPNumber } from '@sora-substrate/util';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSummary, createAssetKey } from '@/portfolio/assetIdentity';
import { aggregatePortfolios } from '@/portfolio/dashboard/aggregate';
import { buildWalletHoldings } from '@/portfolio/dashboard/holdings';
import {
  createAuthoritativeDiscoveryRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
} from '@/util/universalWalletRegistryNetworks';

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));

const MAIN = 'universal-wallet';
const SAVINGS = 'savings-wallet';
// Keyed by CoinGecko coin id, as the price service answers: BTC is priced as `bitcoin`, never by its ticker.
const PRICES = { polkadot: 5, ethereum: 2000, bitcoin: 60000, enjincoin: 0.1 };

const snapshot = readSnapshot();
const popupNetworkMap = { ...networkMap305(snapshot) };
mergeUniversalWalletRegistryNetworks(popupNetworkMap, undefined);
const popupNetworks = Object.values(popupNetworkMap) as NetworkJson[];
const canary = snapshot.find(({ name }) => name === 'Canary Matrixchain')!;

function walletBalances(amounts: Record<string, string>): TokenGroup[] {
  const groups = [
    ...getMockAssets({ ...popupNetworkMap, [canary.name]: canary }, WalletEcosystem.Substrate),
    ...getMockAssets(popupNetworkMap, WalletEcosystem.Bitcoin),
  ];
  const fund = (networkName: string, symbol: string, amount: string) =>
    groups
      .flatMap(({ balances }) => balances)
      .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol.toLowerCase() === symbol)
      .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));

  Object.entries(amounts).forEach(([entry, amount]) => {
    const [networkName, symbol] = entry.split(':');
    fund(networkName, symbol, amount);
  });
  return groups;
}

const MAIN_AMOUNTS = { 'Polkadot:dot': '2', 'Ethereum:eth': '1', 'Bitcoin:btc': '0.1', 'Canary Matrixchain:cenj': '1000' };

function serviceWith(wallets: Record<string, TokenGroup[]>) {
  const service = new BalanceService({
    pricesService: { getPrice: (callback: (prices: unknown) => void) => callback({ tokenPriceMap: PRICES, tokenPriceChange: {} }) },
    networkService: {
      networksGithub: snapshot,
      get authoritativeDiscoveryNetworks() {
        return createAuthoritativeDiscoveryRegistryNetworks(snapshot);
      },
      networkValues: [],
    },
  } as unknown as State);

  Object.assign(service.balanceMap, wallets);
  return service;
}

const polkadot = popupNetworks.find(({ name }) => name === 'Polkadot')!;
const DOT_KEY = createAssetKey({ ecosystem: 'substrate', chainId: polkadot.chainId, assetId: polkadot.assets[0].id });
const sumOf = (values: string[]) => values.reduce((acc, value) => acc.add(new FPNumber(value)), FPNumber.ZERO).toString();

describe('portfolio holdings read', () => {
  it('lists every counted holding, and its total is the sum of their fiat and the wallet list total', async () => {
    const groups = walletBalances(MAIN_AMOUNTS);
    const service = serviceWith({ [MAIN]: groups });
    const [holdings] = await service.getPortfolioHoldings(null);
    const [listed] = await service.getTotalBalances(null);

    expect(holdings.address).toBe(MAIN);
    expect(holdings.total).toBe('8010');
    expect(holdings.total).toBe(listed.visibleTotal);
    expect(sumOf(holdings.holdings.map(({ fiat }) => fiat))).toBe(holdings.total);
    expect(holdings.holdings.map(({ symbol }) => symbol.toUpperCase()).sort()).toEqual(['BTC', 'DOT', 'ETH']);
  });

  it('leaves testnets out of the holdings, as it does out of the total', async () => {
    const [holdings] = await serviceWith({ [MAIN]: walletBalances(MAIN_AMOUNTS) }).getPortfolioHoldings(null);

    expect(holdings.holdings.some(({ networkName }) => networkName === 'Canary Matrixchain')).toBe(false);
  });

  it('carries each holding with the identity, amount, fiat and network it needs to be grouped and drilled into', async () => {
    const [holdings] = await serviceWith({ [MAIN]: walletBalances(MAIN_AMOUNTS) }).getPortfolioHoldings(null);
    const dot = holdings.holdings.find(({ key }) => key === DOT_KEY);

    expect(dot).toMatchObject({ key: DOT_KEY, networkName: 'Polkadot', amount: '2', transferable: '2', fiat: '10', changePercent: null });
  });

  it('drops hidden holdings from the total and the list, and names how many are hidden', async () => {
    const groups = walletBalances(MAIN_AMOUNTS);
    const service = serviceWith({ [MAIN]: groups });
    const request = { hiddenKeysByAddress: { [MAIN]: [DOT_KEY] } };
    const [holdings] = await service.getPortfolioHoldings(request);
    const [listed] = await service.getTotalBalances(request);
    const header = buildPortfolioSummary({
      groups,
      networks: popupNetworks,
      prices: PRICES,
      preferences: { [DOT_KEY]: 'hidden' },
      addressForNetwork: () => MAIN,
    });

    expect(holdings.total).toBe('8000');
    expect(holdings.total).toBe(header.total);
    expect(holdings.total).toBe(listed.visibleTotal);
    expect(holdings.hiddenCount).toBe(1);
    expect(holdings.holdings.some(({ key }) => key === DOT_KEY)).toBe(false);
  });

  it('answers once per wallet, each with its own hidden keys', async () => {
    const service = serviceWith({
      [MAIN]: walletBalances(MAIN_AMOUNTS),
      [SAVINGS]: walletBalances({ 'Polkadot:dot': '10' }),
    });
    const answers = await service.getPortfolioHoldings({ hiddenKeysByAddress: { [SAVINGS]: [DOT_KEY] } });
    const byAddress = Object.fromEntries(answers.map((answer) => [answer.address, answer]));

    expect(Object.keys(byAddress).sort()).toEqual([MAIN, SAVINGS].sort());
    expect(byAddress[MAIN].total).toBe('8010');
    expect(byAddress[SAVINGS].total).toBe('0');
    expect(byAddress[SAVINGS].hiddenCount).toBe(1);
  });

  it('ignores a malformed request instead of failing the dashboard', async () => {
    const service = serviceWith({ [MAIN]: walletBalances(MAIN_AMOUNTS) });

    for (const request of [{ hiddenKeysByAddress: [DOT_KEY] }, { hiddenKeysByAddress: { [MAIN]: 'all' } }, { hiddenKeysByAddress: { [MAIN]: [7] } }]) {
      const [holdings] = await service.getPortfolioHoldings(request as never);
      expect(holdings.total).toBe('8010');
    }
    const [mixed] = await service.getPortfolioHoldings({ hiddenKeysByAddress: { [MAIN]: [7, DOT_KEY] } } as never);
    expect(mixed.total).toBe('8000');
  });

  it('is empty, not an error, for a wallet with no funds', async () => {
    const [holdings] = await serviceWith({ [MAIN]: walletBalances({}) }).getPortfolioHoldings(null);

    expect(holdings).toMatchObject({ total: '0', holdings: [], hiddenCount: 0, staleNetworks: [] });
    expect(holdings.latestTimestamp).toBeUndefined();
  });
});

describe('wallet holdings', () => {
  const input = (groups: TokenGroup[], extra = {}) => ({
    groups,
    networks: popupNetworks,
    prices: PRICES,
    addressForNetwork: () => MAIN,
    ...extra,
  });

  it('counts exactly what the portfolio summary counts, for funded, unpriced and unfunded rows alike', () => {
    for (const amounts of [{}, { 'Polkadot:dot': '3' }, MAIN_AMOUNTS, { 'Bitcoin:btc': '0.5', 'Ethereum:eth': '0.25' }]) {
      const groups = walletBalances(amounts);
      const holdings = buildWalletHoldings(MAIN, input(groups));
      const summary = buildPortfolioSummary(input(groups));

      expect(holdings.total).toBe(summary.total);
      expect(sumOf(holdings.holdings.map(({ fiat }) => fiat))).toBe(summary.total);
      expect(holdings.unpricedCount).toBe(summary.unpricedCount);
      expect(holdings.unavailableCount).toBe(summary.unavailableCount);
    }
  });

  it('reports the 24 h change the summary reports', () => {
    const groups = walletBalances({ 'Polkadot:dot': '2' });
    const withChange = input(groups, { priceChanges: { polkadot: 10 } });
    const holdings = buildWalletHoldings(MAIN, withChange);
    const summary = buildPortfolioSummary(withChange);

    expect(holdings.changeAmount).toBe(summary.changeAmount);
    expect(holdings.changePercent).toBe(summary.changePercent);
    expect(holdings.holdings.find(({ key }) => key === DOT_KEY)?.changePercent).toBe('10');
  });

  it('names a network that holds counted value and whose last update failed, and no other', () => {
    const groups = walletBalances({ 'Polkadot:dot': '2', 'Ethereum:eth': '1' });
    const holdings = buildWalletHoldings(
      MAIN,
      input(groups, {
        scanStates: {
          Polkadot: { lastAttempt: 1_800_000_000_000, stale: true, error: 'timeout', coverage: 'complete' },
          Bitcoin: { lastAttempt: 1_800_000_000_000, stale: true, error: 'timeout', coverage: 'complete' },
        },
      })
    );

    // Bitcoin failed too, but this wallet holds nothing there, so the failure does not make the total partial.
    expect(holdings.staleNetworks).toEqual(['Polkadot']);
  });

  it('dates the newest counted balance in milliseconds, whatever unit the provider used', () => {
    const groups = walletBalances({ 'Polkadot:dot': '2', 'Ethereum:eth': '1' });
    const balances = groups.flatMap(({ balances: items }) => items);
    const stamp = (name: string, symbol: string, timestamp: number) =>
      balances.filter((item) => item.name === name && item.symbol.toLowerCase() === symbol).forEach((item) => Object.assign(item, { timestamp }));

    stamp('polkadot', 'dot', 1_800_000_000); // seconds
    stamp('ethereum', 'eth', 1_800_000_600_000); // milliseconds

    expect(buildWalletHoldings(MAIN, input(groups)).latestTimestamp).toBe(1_800_000_600_000);
  });
});

describe('aggregate portfolio', () => {
  const wallet = (name: string, total: string, changeAmount: string, extra = {}) => ({
    address: `addr-${name}`,
    name,
    total,
    changeAmount,
    changePercent: '0',
    hiddenCount: 0,
    unpricedCount: 0,
    unavailableCount: 0,
    poolStakesExcluded: false,
    holdings: [],
    staleNetworks: [],
    ...extra,
  });

  it('adds the wallet totals and orders wallets by value, with their share', () => {
    const aggregate = aggregatePortfolios([wallet('Savings', '2000', '0'), wallet('Main', '6000', '0'), wallet('Spare', '2000', '0')]);

    expect(aggregate.total).toBe('10000');
    expect(aggregate.wallets.map(({ name }) => name)).toEqual(['Main', 'Savings', 'Spare']);
    expect(aggregate.wallets.map(({ share }) => share)).toEqual([60, 20, 20]);
  });

  it('computes the change over the summed value a day ago, not an average of percentages', () => {
    // 1000 -> 1100 (+100) and 9000 -> 9000 (0): +100 over 10000 is +1%, where averaging 10% and 0% would say +5%.
    const aggregate = aggregatePortfolios([wallet('A', '1100', '100', { changePercent: '10' }), wallet('B', '9000', '0')]);

    expect(aggregate.changeAmount).toBe('100');
    expect(new FPNumber(aggregate.changePercent).toNumber()).toBeCloseTo(100 / 10000 * 100, 6);
  });

  it('carries the exclusions of every wallet, so the caption can name them for the whole set', () => {
    const aggregate = aggregatePortfolios([
      wallet('A', '10', '0', { hiddenCount: 2, unpricedCount: 1 }),
      wallet('B', '5', '0', { hiddenCount: 1, unavailableCount: 3, poolStakesExcluded: true }),
    ]);

    expect(aggregate).toMatchObject({ hiddenCount: 3, unpricedCount: 1, unavailableCount: 3, poolStakesExcluded: true });
  });

  it('has zero value, shares and change for no wallets or only empty ones', () => {
    expect(aggregatePortfolios([])).toMatchObject({ total: '0', changeAmount: '0', changePercent: '0', wallets: [] });
    const empty = aggregatePortfolios([wallet('A', '0', '0'), wallet('B', '0', '0')]);

    expect(empty.total).toBe('0');
    expect(empty.wallets.map(({ share }) => share)).toEqual([0, 0]);
  });
});
