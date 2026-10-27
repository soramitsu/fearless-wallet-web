import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

const mocks = vi.hoisted(() => ({
  forceAssetDiscoverySweep: vi.fn(),
  fetchNfts: vi.fn(),
  accountsStore: null as unknown as Record<string, unknown>,
  networksStore: {
    allNetworks: [],
    assetsPrice: { tokenPriceMap: {} },
    getNetwork: vi.fn(),
    loadIndexerNetworkBalance: vi.fn(),
  },
  extensionStore: { features: { assetDiscoveryMode: 'visible' } },
}));

vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: mocks.forceAssetDiscoverySweep }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: mocks.fetchNfts }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => mocks.networksStore }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extensionStore }));
vi.mock('@/portfolio/assetIdentity', () => ({
  buildPortfolioSections: () => [],
  filterSectionAssets: (sections: unknown[]) => sections,
  filterSectionsBySearch: (sections: unknown[]) => sections,
  splitZeroSections: () => ({ funded: [], zeroOnly: [] }),
}));
vi.mock('@/portfolio/usePortfolio', () => {
  const summary = { total: '0', hiddenCount: 0, hiddenFundedKeys: [], unpricedCount: 0, poolStakesExcluded: false, testnetFundedCount: 0 };
  return {
    usePortfolio: () => ({
      effectivePreferences: {}, preferenceSource: () => 'auto', addressForNetwork: () => '', walletScope: () => true,
      networkFilter: () => true, isFiltered: false, zeroRule: () => false, summary, filteredSummary: summary,
      loadStatus: { state: 'settled', pendingCount: 0 },
    }),
  };
});
vi.mock('@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue', () => ({ default: {} }));
vi.mock('@/router/routes', () => ({ Components: { SendForm: 'SendForm', ReceiveForm: 'ReceiveForm' } }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

mocks.accountsStore = reactive({
  assetPreferences: {}, balances: [], isBalanceLoading: false, networkScanStates: {},
  portfolioView: { hideZero: false, showHidden: false, showTestnets: false, zeroNetworksExpanded: false },
  updatePortfolioView: vi.fn(), selectedNetwork: 'All networks',
  selectedWallet: { address: 'substrate-address', ethereumAddress: '0x0000000000000000000000000000000000000001' },
});

// Mirrors Wallet.vue: a per-instance slot id; WalletSettings renders the slot only off the NFT tab (notNftTabActive).
let views = 0;
const WalletLike = defineComponent({
  name: 'WalletLike',
  data: () => ({ refreshSlotId: `portfolio-refresh-${++views}` }),
  computed: { notNft(): boolean { return this.$route.name !== 'Nfts'; } },
  template: `<div class="wallet" :data-slot="refreshSlotId">
    <div v-if="notNft" class="view-controls"><span :id="refreshSlotId" class="refresh-slot"></span></div>
    <router-view :balances="[]" :showAssetsManagementForm="false" filterValue="" :refreshSlotId="refreshSlotId" />
  </div>`,
});
// Mirrors Main.vue: kept-alive children keyed by route.fullPath.
const Shell = defineComponent({
  template: `<div class="main"><router-view v-slot="{ Component, route }"><keep-alive :max="20">
    <component :is="Component" :key="route.fullPath" class="main-child" />
  </keep-alive></router-view></div>`,
});
const Plain = (name: string) => defineComponent({ name, template: `<div class="${name}" />` });

const build = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/fearless', component: Shell, children: [
        { path: 'portfolio', name: 'Wallet', component: WalletLike, redirect: { name: 'Currencies' }, children: [
          { path: 'tokens', name: 'Currencies', component: Currencies },
          { path: 'nfts', name: 'Nfts', component: Plain('nfts') },
        ] },
        { path: 'settings', name: 'Settings', component: Plain('settings') },
      ],
    }],
  });
  const errors: unknown[] = [];
  await router.push('/fearless/portfolio/tokens');
  const wrapper = mount({ template: '<router-view />' }, {
    attachTo: document.body,
    global: {
      plugins: [router],
      config: { errorHandler: (error) => { errors.push(error); }},
      mocks: { $t: (key: string) => ({ 'portfolioPage.refresh': 'Refresh', 'portfolioPage.syncing': 'Syncing' })[key] ?? key },
      stubs: {
        Icon: { template: '<span />' }, Loader: { template: '<span />' }, PortfolioExclusions: true,
        PortfolioHiddenFundsNotice: true, PortfolioZeroNetworks: true, Scroll: { template: '<main><slot /></main>' },
      },
    },
  });
  await flushPromises();
  const go = async (path: string) => { await router.push(path); await flushPromises(); };
  // The wallet screen in the document (KeepAlive keeps the others in a detached container).
  const visibleRefresh = () => {
    const slot = document.querySelector('.wallet .refresh-slot');
    return { slot: slot?.id, buttons: slot?.querySelectorAll('[data-testid="portfolioRefresh"]').length ?? -1 };
  };
  return { router, wrapper, go, visibleRefresh, errors };
};

describe('Refresh in kept-alive wallet screens', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('keeps one Refresh in the toolbar across Tokens, NFTs and Settings', async () => {
    const h = await build();
    expect(h.visibleRefresh().buttons).toBe(1);
    await h.go('/fearless/portfolio/nfts');
    await h.go('/fearless/portfolio/tokens');
    expect(h.visibleRefresh().buttons).toBe(1);
    await h.go('/fearless/settings');
    await h.go('/fearless/portfolio/tokens');
    expect(h.visibleRefresh().buttons).toBe(1);
    expect(h.errors).toEqual([]);
    h.wrapper.unmount();
  });

  it('finds the toolbar again for a list made while its screen was off the page', async () => {
    // An old wallet's guard sends Settings links to ?security=recovery-only, a second screen; the first screen, kept
    // alive off the page, follows the route and makes a new list there.
    const h = await build();
    await h.go('/fearless/settings');
    await h.go('/fearless/portfolio/tokens?security=recovery-only');
    expect(h.visibleRefresh().buttons).toBe(1);
    await h.go('/fearless/portfolio/tokens');
    expect(h.visibleRefresh().buttons).toBe(1);
    mocks.accountsStore.isBalanceLoading = true;
    await flushPromises();
    mocks.accountsStore.isBalanceLoading = false;
    await flushPromises();
    expect(h.visibleRefresh().buttons).toBe(1);
    expect(h.errors).toEqual([]);
    h.wrapper.unmount();
  });

  it('lets the NFT screen kept after Tokens, NFTs and back re-render without errors', async () => {
    const h = await build();
    await h.go('/fearless/portfolio/nfts');
    await h.go('/fearless/portfolio/tokens');
    mocks.accountsStore.isBalanceLoading = true;
    await flushPromises();
    mocks.accountsStore.isBalanceLoading = false;
    await flushPromises();
    expect(h.errors).toEqual([]);
    h.wrapper.unmount();
  });
});
