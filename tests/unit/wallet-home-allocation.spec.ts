import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { dashboardI18n } from './support/dashboardI18n';
import type { HoldingRef } from '@/portfolio/dashboard/facets';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const store = vi.hoisted(() => ({ preferences: { slots: {} as Record<string, Record<string, number>> }, setSlots: vi.fn() }));
const accounts = vi.hoisted(() => ({
  isBalanceLoading: false,
  selectedWallet: { address: 'main' },
  fiatSymbol: '$',
  setSelectedNetwork: vi.fn(),
}));
const dashboard = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({ Components: { TokenOverview: 'TokenOverview', Currencies: 'Currencies' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/portfolio/dashboard/locales', () => ({ registerDashboardMessages: vi.fn() }));
vi.mock('@/portfolio/usePortfolio', () => ({ usePortfolio: () => ({ summaryInput: ref({}), hiddenKeys: ref(new Set()) }) }));
vi.mock('@/portfolio/dashboard/usePortfolioDashboard', () => ({ usePortfolioDashboard: () => dashboard.value }));
vi.mock('@/stores/portfolioDashboard', () => ({ usePortfolioDashboardStore: () => store }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => accounts }));

import PortfolioAllocation from '@/screens/portfolio/PortfolioAllocation.vue';

const holding = (address: string, walletName: string, key: string, networkName: string, symbol: string, fiat: string): HoldingRef =>
  ({ address, walletName, holding: { key, networkName, symbol, name: symbol, amount: fiat, fiat, changePercent: null } }) as never;

const refs = [
  holding('main', 'Main', 'substrate:polkadot:dot', 'Polkadot', 'DOT', '60'),
  holding('main', 'Main', 'substrate:hub:dot', 'Polkadot AssetHub', 'DOT', '10'),
  holding('main', 'Main', 'evm:ethereum:eth', 'Ethereum', 'ETH', '300'),
  holding('savings', 'Savings', 'evm:ethereum:eth', 'Ethereum', 'ETH', '30'),
];
const groups: Record<string, { id: string; symbol: string; name: string }> = {
  'substrate:polkadot:dot': { id: 'dot', symbol: 'DOT', name: 'Polkadot' },
  'substrate:hub:dot': { id: 'dot', symbol: 'DOT', name: 'Polkadot' },
};

function useDashboard({ scope = 'wallet', pending = false, holdings = refs } = {}) {
  dashboard.value = {
    scope: ref(scope),
    pending: ref(pending),
    refs: ref(holdings),
    groupOf: ref((key: string) => groups[key]),
  };
}

const wrappers: VueWrapper[] = [];
const mountAllocation = () => {
  const wrapper = mount(PortfolioAllocation, {
    global: { stubs: { Shimmer: true, PortfolioSky: { name: 'PortfolioSky', props: ['groups', 'activeKey'], template: '<div class="sky-stub" />' } } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const rows = (wrapper: VueWrapper, testId = 'allocationRow') =>
  wrapper.findAll(`[data-testid="${testId}"]`).map((row) => [row.attributes('data-key'), row.get('.share').text(), row.get('.value').text()]);
const parts = (wrapper: VueWrapper) => wrapper.findAll('.part').map((part) => part.attributes('data-facet'));

describe('the Portfolio view of the wallet home', () => {
  beforeEach(() => {
    router.push.mockReset();
    accounts.setSelectedNetwork.mockReset();
    store.setSlots.mockReset();
    store.preferences.slots = {};
    accounts.isBalanceLoading = false;
    useDashboard();
  });

  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

  it('charts the wallet by token, largest first, each with its share and value', async () => {
    const wrapper = mountAllocation();
    await flushPromises();

    expect(rows(wrapper)).toEqual([
      ['evm:ethereum:eth', '83%', '$330.00'],
      ['group:dot', '18%', '$70.00'],
    ]);
    expect(wrapper.getComponent({ name: 'PortfolioSky' }).props('groups')).toHaveLength(2);
    // A colour follows its token from one visit to the next.
    expect(store.setSlots).toHaveBeenCalledWith('wallet:main:token', expect.objectContaining({ 'group:dot': expect.any(Number) }));
  });

  it('highlights a token on the first pick and opens its page on the second', async () => {
    const wrapper = mountAllocation();
    await flushPromises();
    const dot = () => wrapper.get('[data-testid="allocationRow"][data-key="group:dot"]');

    await dot().trigger('click');
    expect(dot().attributes('aria-pressed')).toBe('true');
    expect(wrapper.getComponent({ name: 'PortfolioSky' }).props('activeKey')).toBe('group:dot');
    expect(router.push).not.toHaveBeenCalled();

    await dot().trigger('click');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'TokenOverview', params: { token: 'group:dot' } });
    expect(dot().attributes('aria-pressed')).toBe('false');
  });

  it('opens Where it lives for a token of All wallets', async () => {
    useDashboard({ scope: 'all' });
    const wrapper = mountAllocation();
    await flushPromises();

    await wrapper.get('[data-testid="allocationRow"][data-key="group:dot"]').trigger('click');
    await wrapper.get('[data-testid="allocationRow"][data-key="group:dot"]').trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'TokenLocations', query: { token: 'group:dot' } });
  });

  it('shows the same total by network under the tokens, with no switch between them', async () => {
    const wrapper = mountAllocation();
    await flushPromises();

    expect(wrapper.findAll('[data-testid^="allocationLens-"]')).toHaveLength(0);
    expect(parts(wrapper)).toEqual(['token', 'network']);
    expect(rows(wrapper, 'allocationRow-network')).toEqual([
      ['Ethereum', '83%', '$330.00'],
      ['Polkadot', '15%', '$60.00'],
      ['Polkadot AssetHub', '3%', '$10.00'],
    ]);
    // The chart stays the tokens'.
    expect(wrapper.getComponent({ name: 'PortfolioSky' }).props('groups').map(({ key }: { key: string }) => key)).toEqual([
      'evm:ethereum:eth',
      'group:dot',
    ]);
    expect(store.setSlots).toHaveBeenCalledWith('wallet:main:network', expect.objectContaining({ Ethereum: expect.any(Number) }));
  });

  it("opens the wallet's list on a network picked from its row", async () => {
    const wrapper = mountAllocation();
    await flushPromises();

    await wrapper.get('[data-testid="allocationRow-network"][data-key="Polkadot"]').trigger('click');

    expect(accounts.setSelectedNetwork).toHaveBeenCalledExactlyOnceWith('Polkadot');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'Currencies' });
  });

  it('adds the wallets for All wallets, whose network and wallet rows open nothing', async () => {
    useDashboard({ scope: 'all' });
    const wrapper = mountAllocation();
    await flushPromises();

    expect(parts(wrapper)).toEqual(['token', 'network', 'wallet']);
    expect(rows(wrapper, 'allocationRow-wallet').map(([key]) => key)).toEqual(['main', 'savings']);
    expect(wrapper.get('[data-testid="allocationRow-network"][data-key="Polkadot"]').element.tagName).toBe('DIV');
    expect(wrapper.get('[data-testid="allocationRow-wallet"][data-key="main"]').element.tagName).toBe('DIV');

    await wrapper.get('[data-testid="allocationRow-network"][data-key="Polkadot"]').trigger('click');
    expect(accounts.setSelectedNetwork).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('waits while balances load, and says when nothing has a price yet', async () => {
    useDashboard({ pending: true });
    const loading = mountAllocation();
    await flushPromises();
    expect(loading.find('[data-testid="allocationLoading"]').exists()).toBe(true);

    useDashboard({ holdings: [] });
    const empty = mountAllocation();
    await flushPromises();
    expect(empty.get('[data-testid="allocationEmpty"]').text()).toBe('Nothing with a price to chart yet.');
    expect(empty.find('[data-testid="allocationRows"]').exists()).toBe(false);
  });

  it('names each row for assistive technology with its share and value', async () => {
    const wrapper = mountAllocation();
    await flushPromises();

    expect(wrapper.get('[data-testid="allocationRow"][data-key="group:dot"]').attributes('aria-label')).toBe('DOT: 18 percent, $70.00');
  });
});
