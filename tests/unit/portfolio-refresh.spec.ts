import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  forceAssetDiscoverySweep: vi.fn(),
  fetchNfts: vi.fn(),
  accountsStore: {
    assetPreferences: {},
    balances: [],
    isBalanceLoading: false,
    networkScanStates: {},
    portfolioView: { hideZero: false, showHidden: false, showTestnets: false, zeroNetworksExpanded: false },
    updatePortfolioView: vi.fn(),
    selectedNetwork: 'All networks',
    selectedWallet: {
      address: 'substrate-address',
      ethereumAddress: '0x0000000000000000000000000000000000000001',
    },
  },
  networksStore: {
    allNetworks: [],
    assetsPrice: { tokenPriceMap: {} },
    getNetwork: vi.fn(),
    loadIndexerNetworkBalance: vi.fn(),
  },
  extensionStore: {
    features: { assetDiscoveryMode: 'visible' },
  },
}));

vi.mock('@/extension/messaging/asset-discovery', () => ({
  forceAssetDiscoverySweep: mocks.forceAssetDiscoverySweep,
}));
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
  const summary = {
    total: '0',
    hiddenCount: 0,
    hiddenFundedKeys: [],
    unpricedCount: 0,
    poolStakesExcluded: false,
    testnetFundedCount: 0,
  };

  return {
    usePortfolio: () => ({
      effectivePreferences: {},
      preferenceSource: () => 'auto',
      addressForNetwork: () => '',
      walletScope: () => true,
      networkFilter: () => true,
      isFiltered: false,
      zeroRule: () => false,
      summary,
      filteredSummary: summary,
      loadStatus: { state: 'settled', pendingCount: 0 },
    }),
  };
});
vi.mock('@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue', () => ({ default: {} }));
vi.mock('@/router/routes', () => ({ Components: { SendForm: 'SendForm', ReceiveForm: 'ReceiveForm' } }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

const mountPortfolio = (refreshSlotId = '') =>
  mount(Currencies, {
    attachTo: refreshSlotId ? document.body : undefined,
    props: {
      balances: [],
      filterValue: '',
      showAssetsManagementForm: false,
      refreshSlotId,
    },
    global: {
      mocks: {
        $t: (key: string) =>
          ({
            'portfolioPage.refresh': 'Refresh',
            'portfolioPage.syncing': 'Syncing',
          })[key] ?? key,
      },
      stubs: {
        Icon: { template: '<span />' },
        Loader: { template: '<span />' },
        PortfolioNetworkSection: { template: '<section />' },
        PortfolioExclusions: true,
        PortfolioHiddenFundsNotice: true,
        PortfolioZeroNetworks: true,
        Scroll: { template: '<main><slot /></main>' },
      },
    },
  });

describe('Portfolio manual refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs one forced asset sweep, refreshes NFTs and prevents overlapping scans', async () => {
    let completeSweep: (() => void) | undefined;

    mocks.forceAssetDiscoverySweep.mockImplementation(
      () => new Promise<void>((resolve) => (completeSweep = resolve))
    );
    mocks.fetchNfts.mockResolvedValue(undefined);
    mocks.networksStore.loadIndexerNetworkBalance.mockResolvedValue(undefined);

    const wrapper = mountPortfolio();
    const refresh = wrapper.get('[data-testid="portfolioRefresh"]');

    await refresh.trigger('click');
    await (wrapper.vm as InstanceType<typeof Currencies>).refreshPortfolio();

    expect(mocks.forceAssetDiscoverySweep).toHaveBeenCalledTimes(1);
    // The sweep skips test networks, so the selected network is also reloaded directly.
    expect(mocks.networksStore.loadIndexerNetworkBalance).toHaveBeenCalledWith('All networks');
    expect(mocks.fetchNfts).toHaveBeenCalledWith('0x0000000000000000000000000000000000000001');
    expect(refresh.attributes('aria-busy')).toBe('true');
    expect(refresh.text()).toBe('Syncing');

    completeSweep?.();
    await flushPromises();

    expect(refresh.attributes('aria-busy')).toBe('false');
    expect(refresh.text()).toBe('Refresh');
  });

  it('puts Refresh in the toolbar place the wallet screen keeps for it, leaving no empty row above the list', async () => {
    mocks.forceAssetDiscoverySweep.mockResolvedValue(undefined);
    mocks.fetchNfts.mockResolvedValue(undefined);
    mocks.networksStore.loadIndexerNetworkBalance.mockResolvedValue(undefined);
    const slot = Object.assign(document.createElement('span'), { id: 'portfolio-refresh-test' });
    document.body.append(slot);

    const wrapper = mountPortfolio('portfolio-refresh-test');
    await flushPromises();

    const refresh = slot.querySelector<HTMLButtonElement>('[data-testid="portfolioRefresh"]');
    expect(refresh?.textContent?.trim()).toBe('Refresh');
    expect(wrapper.get('.portfolio-actions').element.querySelector('button')).toBeNull();
    refresh?.click();
    expect(mocks.forceAssetDiscoverySweep).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(slot.querySelector('[data-testid="portfolioRefresh"]')).toBeNull();
    slot.remove();
  });
});
