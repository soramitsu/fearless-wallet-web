import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref, shallowRef } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { ResponsePortfolioHoldings, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { PortfolioSummaryInput } from '@/portfolio/assetIdentity';
import { WalletEcosystem } from '@/interfaces';
import { buildWalletHoldings } from '@/portfolio/dashboard/holdings';
import { SAVED_AFTER_MS } from '@/portfolio/dashboard/syncState';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const MAIN = 'main-wallet';
const SAVINGS = 'savings-wallet';
const PRICES = { polkadot: 5, ethereum: 2000, bitcoin: 60000 };

const mocks = vi.hoisted(() => ({
  getPortfolioHoldings: vi.fn(),
  stored: new Map<string, string>(),
  accounts: undefined as unknown as {
    accounts: Array<{ address: string; name: string }>;
    selectedWallet: { address: string; name: string };
    portfolioView: { lens: string };
  },
  networks: undefined as unknown as { allNetworks: unknown[] },
}));

vi.mock('@/extension/messaging', () => ({ getPortfolioHoldings: mocks.getPortfolioHoldings }));
vi.mock('@/controllers/localStorageController', () => ({
  LocalStorage: class {
    constructor(private prefix: string) {}
    get(key: string) {
      const item = mocks.stored.get(`${this.prefix}${key}`);

      return item ? JSON.parse(item) : {};
    }
    set(key: string, value: unknown) {
      mocks.stored.set(`${this.prefix}${key}`, JSON.stringify({ value }));
    }
  },
}));
vi.mock('@/portfolio/dashboard/hiddenKeys', () => ({ hiddenKeysByAddress: () => ({}) }));
vi.mock('@/stores/accounts', async () => {
  const { reactive } = await import('vue');

  mocks.accounts = reactive({
    accounts: [],
    selectedWallet: { address: '', name: '' },
    networkScanStates: {},
    portfolioView: { lens: 'token' },
    assetPreferencesForAllAccounts: {},
    fiatSymbol: '$',
  }) as never;

  return { useAccountsStore: () => mocks.accounts };
});
vi.mock('@/stores/networks', async () => {
  const { reactive } = await import('vue');

  mocks.networks = reactive({ allNetworks: [] }) as never;

  return { useNetworksStore: () => mocks.networks };
});

import { usePortfolioDashboard } from '@/portfolio/dashboard/usePortfolioDashboard';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';

const snapshot = readSnapshot();
const networkMap = { ...networkMap305(snapshot) };
mergeUniversalWalletRegistryNetworks(networkMap, undefined);
const networks = Object.values(networkMap) as NetworkJson[];

function funded(amounts: Record<string, string>): TokenGroup[] {
  const groups = [...getMockAssets(networkMap, WalletEcosystem.Substrate), ...getMockAssets(networkMap, WalletEcosystem.Bitcoin)];

  Object.entries(amounts).forEach(([entry, amount]) => {
    const [networkName, symbol] = entry.split(':');

    groups
      .flatMap(({ balances }) => balances)
      .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol.toLowerCase() === symbol)
      .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount, timestamp: Date.now() }));
  });

  return groups;
}

const inputFor = (address: string, groups: TokenGroup[]): PortfolioSummaryInput => ({
  groups,
  networks,
  prices: PRICES,
  addressForNetwork: () => address,
});
const savingsAnswer = (extra: Partial<ResponsePortfolioHoldings> = {}): ResponsePortfolioHoldings => ({
  ...buildWalletHoldings(SAVINGS, inputFor(SAVINGS, funded({ 'Ethereum:eth': '0.5' }))),
  latestTimestamp: Date.now(),
  ...extra,
});

const mounted: Array<{ unmount: () => void }> = [];

function mountDashboard() {
  const summaryInput = shallowRef<PortfolioSummaryInput>(inputFor(MAIN, funded({ 'Polkadot:dot': '2', 'Ethereum:eth': '1' })));
  const exposed = {} as ReturnType<typeof usePortfolioDashboard>;
  const wrapper = mount(
    defineComponent({
      setup() {
        Object.assign(exposed, usePortfolioDashboard({ summaryInput, hiddenKeys: ref(new Set<string>()) }));

        return () => h('div');
      },
    })
  );

  mounted.push(wrapper);

  return { wrapper, dashboard: exposed, summaryInput };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
  setActivePinia(createPinia());
  mocks.stored.clear();
  mocks.getPortfolioHoldings.mockReset();
  mocks.networks.allNetworks = networks;
  mocks.accounts.accounts = [
    { address: MAIN, name: 'Main' },
    { address: SAVINGS, name: 'Savings' },
  ];
  mocks.accounts.selectedWallet = { address: MAIN, name: 'Main' };
  mocks.accounts.portfolioView.lens = 'token';
});
afterEach(() => {
  // A dashboard left mounted keeps reading on its timer, into the next test.
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});

describe('portfolio dashboard composable', () => {
  it('reads as one wallet, with no background read, when there is only one wallet', async () => {
    mocks.accounts.accounts = [{ address: MAIN, name: 'Main' }];
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.scope.value).toBe('wallet');
    expect(dashboard.pending.value).toBe(false);
    expect(dashboard.aggregate.value.total).toBe('2010');
    expect(mocks.getPortfolioHoldings).not.toHaveBeenCalled();
  });

  it('says nothing about All wallets until every wallet has been read', async () => {
    let answer!: (holdings: ResponsePortfolioHoldings[]) => void;
    mocks.getPortfolioHoldings.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { dashboard } = mountDashboard();

    expect(dashboard.scope.value).toBe('all');
    expect(dashboard.pending.value).toBe(true);

    answer([savingsAnswer()]);
    await flushPromises();

    expect(dashboard.pending.value).toBe(false);
  });

  it('adds the selected wallet, computed here, to what the background reports for the others', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([
      // The background's own entry for the selected wallet is ignored: the popup's balances are the fresher ones.
      { ...savingsAnswer(), address: MAIN, total: '999999' },
      savingsAnswer(),
    ]);
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.aggregate.value.total).toBe('3010');
    expect(dashboard.aggregate.value.wallets.map(({ name, total }) => [name, total])).toEqual([
      ['Main', '2010'],
      ['Savings', '1000'],
    ]);
  });

  it('counts a wallet the background does not list as empty once the read has arrived', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([]);
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.aggregate.value.total).toBe('2010');
    expect(dashboard.aggregate.value.wallets.map(({ name }) => name).sort()).toEqual(['Main', 'Savings']);
  });

  it('keeps trying, and stays pending, while the first read keeps failing', async () => {
    mocks.getPortfolioHoldings.mockRejectedValue(new Error('port closed'));
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.pending.value).toBe(true);

    mocks.getPortfolioHoldings.mockResolvedValue([savingsAnswer()]);
    await vi.advanceTimersByTimeAsync(5000);

    expect(dashboard.pending.value).toBe(false);
    expect(mocks.getPortfolioHoldings.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the last answer as saved, no fresher than when it was read, after a read fails', async () => {
    mocks.getPortfolioHoldings.mockResolvedValueOnce([savingsAnswer({ latestTimestamp: Date.now() })]);
    const { dashboard, summaryInput } = mountDashboard();
    await flushPromises();

    expect(dashboard.syncState.value.kind).toBe('live');

    mocks.getPortfolioHoldings.mockRejectedValue(new Error('port closed'));
    await vi.advanceTimersByTimeAsync(SAVED_AFTER_MS + 60_000);
    // The selected wallet keeps updating in the popup; only the wallet that could not be read ages.
    summaryInput.value = inputFor(MAIN, funded({ 'Polkadot:dot': '2', 'Ethereum:eth': '1' }));

    expect(dashboard.pending.value).toBe(false);
    expect(dashboard.aggregate.value.wallets.find(({ name }) => name === 'Savings')?.total).toBe('1000');
    expect(dashboard.syncState.value.kind).toBe('saved');
    expect(dashboard.syncState.value.savedWallets.map(({ name }) => name)).toEqual(['Savings']);
  });

  it('names a network that failed while it holds counted value', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([savingsAnswer({ staleNetworks: ['Ethereum'] })]);
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.syncState.value).toMatchObject({ kind: 'partial', staleNetworks: ['Ethereum'] });
  });

  it('keeps one chart colour per token as the values change', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([savingsAnswer()]);
    const { dashboard, summaryInput } = mountDashboard();
    await flushPromises();
    const slotOf = (key: string) => dashboard.allocation.value.groups.find((group) => group.key === key)?.slot;
    const ethKey = dashboard.allocation.value.groups.find(({ name }) => name === 'ETH')?.key as string;
    const before = slotOf(ethKey);

    // The main wallet's ETH grows ten times; its rank changes, its colour does not.
    summaryInput.value = inputFor(MAIN, funded({ 'Polkadot:dot': '2', 'Ethereum:eth': '10' }));
    await flushPromises();

    expect(before).toBeGreaterThan(0);
    expect(slotOf(ethKey)).toBe(before);
    expect(usePortfolioDashboardStore().preferences.slots['all:token']?.[ethKey]).toBe(before);
  });

  it('stops reading when the dashboard goes away', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([savingsAnswer()]);
    const { wrapper } = mountDashboard();
    await flushPromises();
    const calls = mocks.getPortfolioHoldings.mock.calls.length;

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.getPortfolioHoldings.mock.calls.length).toBe(calls);
  });

  it('follows the wallet screen lens for one wallet, and its own lens for All wallets', async () => {
    mocks.getPortfolioHoldings.mockResolvedValue([savingsAnswer()]);
    const { dashboard } = mountDashboard();
    await flushPromises();

    expect(dashboard.lens.value).toBe('token');
    usePortfolioDashboardStore().setLens('wallet');
    expect(dashboard.lens.value).toBe('wallet');
    expect(dashboard.allocation.value.groups.map(({ name }) => name).sort()).toEqual(['Main', 'Savings']);

    usePortfolioDashboardStore().setScope('wallet');
    mocks.accounts.portfolioView.lens = 'network';
    expect(dashboard.lens.value).toBe('network');
  });
});
