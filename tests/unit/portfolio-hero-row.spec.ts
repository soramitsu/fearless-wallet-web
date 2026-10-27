import { mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardI18n } from './support/dashboardI18n';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';

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

const groups: AllocationGroup[] = [
  { key: 'eth', name: 'ETH', value: 75, share: 75, rays: 75, slot: 1 },
  { key: 'dot', name: 'DOT', value: 25, share: 25, rays: 25, slot: 2 },
];
const wrappers: VueWrapper[] = [];
const hero = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(PortfolioHero, {
    props: {
      total: '1930', changeAmount: '0', changePercent: '0', caption: '', hiddenCount: 0, unpricedCount: 0,
      unavailableCount: 0, poolStakesExcluded: false, loading: false,
      sync: { kind: 'live', savedWallets: [], staleNetworks: [] }, groups, activeKey: null, showSwap: true, ...props,
    },
    global: { stubs: { Icon: true, Shimmer: true, PortfolioSky: true } },
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

  it('keeps Swap at the end of the legend row rather than on a row of its own', () => {
    const wrapper = hero();
    const row = wrapper.get('[data-testid="heroLegend"]').element.parentElement;

    expect(wrapper.get('[data-testid="heroSwap"]').element.closest('.hero-row')).toBe(row);
    expect(hero({ groups: [] }).find('.hero-row [data-testid="heroSwap"]').exists()).toBe(true);
    expect(hero({ groups: [], showSwap: false }).find('.hero-row').exists()).toBe(false);
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
});
