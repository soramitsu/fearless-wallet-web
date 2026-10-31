import { mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardI18n } from './support/dashboardI18n';

const dashboard = {
  scope: ref('wallet'),
  lens: ref('token'),
  pending: ref(false),
  syncState: ref({ kind: 'live', savedWallets: [], staleNetworks: [] }),
  allocation: ref({ groups: [], slots: {} }),
  aggregate: ref({ total: '0', changeAmount: '0', changePercent: '0', wallets: [] }),
  tokenRows: ref([]),
  networkSections: ref([]),
  iconOf: () => '',
  refresh: vi.fn(),
};

vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$', accounts: [] }) }));
vi.mock('@/stores/portfolioDashboard', () => ({ usePortfolioDashboardStore: () => ({ setScope: vi.fn(), setLens: vi.fn() }) }));
vi.mock('@/portfolio/dashboard/usePortfolioDashboard', () => ({ usePortfolioDashboard: () => dashboard }));
vi.mock('@/portfolio/dashboard/useReadiness', () => ({ useReadiness: () => ({ readinessOf: () => 'ready' }) }));
vi.mock('@/portfolio/dashboard/locales', () => ({ registerDashboardMessages: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ updateCurrentAccount: vi.fn(), forceAssetDiscoverySweep: vi.fn() }));
vi.mock('vue-router', async (original) => ({ ...(await original<typeof import('vue-router')>()), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/router', () => ({ default: { push: vi.fn(), beforeEach: vi.fn(), afterEach: vi.fn(), currentRoute: { value: {} } } }));
vi.mock('@/screens/portfolio/PortfolioAllWallets.vue', () => ({ default: { name: 'PortfolioAllWallets', template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioCountingSheet.vue', () => ({ default: { name: 'PortfolioCountingSheet', template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioSyncSheet.vue', () => ({ default: { name: 'PortfolioSyncSheet', template: '<div />' } }));

import PortfolioDashboard from '@/screens/portfolio/PortfolioDashboard.vue';
import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';

const wrappers: VueWrapper[] = [];
const hero = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(PortfolioHero, {
    props: {
      total: '1930', changeAmount: '0', changePercent: '0', caption: '', hiddenCount: 0, unpricedCount: 0,
      unavailableCount: 0, poolStakesExcluded: false, loading: false,
      sync: { kind: 'live', savedWallets: [], staleNetworks: [] }, showSwap: true, showSend: true, showReceive: true, ...props,
    },
    global: { stubs: { Icon: true, Shimmer: true } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('the portfolio hero', () => {
  it('names a failed balance once, though the wallet caption already ends with it', () => {
    const caption = hero({
      caption: 'Showing Ethereum · $1,620.00 · Balance update failed',
      unavailableCount: 2,
      poolStakesExcluded: true,
    }).get('[data-testid="heroCaption"]').text();

    expect(caption).toBe('Showing Ethereum · $1,620.00 · Balance update failed · Pool stakes not included');
  });

  it('puts Send, Receive and Swap in one row under the balance, as Exodus does', async () => {
    const wrapper = hero();
    const actions = wrapper.get('[data-testid="heroActions"]');

    expect(actions.findAll('button').map((button) => [button.attributes('data-testid'), button.text()])).toEqual([
      ['heroSend', 'Send'],
      ['heroReceive', 'Receive'],
      ['heroSwap', 'Swap'],
    ]);
    expect(actions.get('[data-testid="heroSwap"]').attributes('aria-label')).toBe('Swap on Polkaswap');

    await actions.get('[data-testid="heroSend"]').trigger('click');
    await actions.get('[data-testid="heroReceive"]').trigger('click');
    await actions.get('[data-testid="heroSwap"]').trigger('click');
    expect([wrapper.emitted('send'), wrapper.emitted('receive'), wrapper.emitted('swap')]).toEqual([[[]], [[]], [[]]]);
  });

  it('leaves out what the wallet cannot do, and the whole row when it can do nothing', () => {
    expect(hero({ showReceive: false, showSwap: false }).findAll('[data-testid="heroActions"] button').map((button) => button.attributes('data-testid'))).toEqual(['heroSend']);
    expect(hero({ showSend: false, showReceive: false, showSwap: false }).find('[data-testid="heroActions"]').exists()).toBe(false);
  });

  it('offers no Swap to a wallet that cannot swap', () => {
    const summary = { total: '10', changeAmount: '0', changePercent: '0', hiddenCount: 0, unpricedCount: 0, unavailableCount: 0, poolStakesExcluded: false };
    const mountDashboard = (props: Record<string, unknown>) => {
      const wrapper = shallowMount(PortfolioDashboard, {
        props: { summary, summaryInput: {}, hiddenKeys: new Set<string>(), caption: '', loading: false, ...props } as never,
      });
      wrappers.push(wrapper);
      return wrapper.getComponent(PortfolioHero);
    };

    expect(mountDashboard({}).props('showSwap')).toBe(true);
    expect(mountDashboard({ swapAvailable: false }).props('showSwap')).toBe(false);
  });

  it('hands All wallets the dashboard\'s logo for each token row', () => {
    const summary = { total: '10', changeAmount: '0', changePercent: '0', hiddenCount: 0, unpricedCount: 0, unavailableCount: 0, poolStakesExcluded: false };
    dashboard.scope.value = 'all';
    try {
      const wrapper = shallowMount(PortfolioDashboard, {
        props: { summary, summaryInput: {}, hiddenKeys: new Set<string>(), caption: '', loading: false } as never,
      });
      wrappers.push(wrapper);
      // A SORA row wears polkaswap.io's logo only if this function reaches the list (portfolio-dashboard-token-icons).
      expect(wrapper.getComponent({ name: 'PortfolioAllWallets' }).vm.$attrs.iconOf).toBe(dashboard.iconOf);
    } finally {
      dashboard.scope.value = 'wallet';
    }
  });
});
