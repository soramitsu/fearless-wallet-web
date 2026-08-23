import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  forceAssetDiscoverySweep: vi.fn(),
  fetchNfts: vi.fn(),
  accountsStore: {
    assetPreferences: {},
    balances: [],
    isBalanceLoading: false,
    migrateLegacyAssetPreferences: vi.fn(),
    networkScanStates: {},
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
  buildAssetPreferenceSnapshot: () => [],
  buildPortfolioSections: () => [],
}));
vi.mock('@/consts/networks', () => ({
  ALL_NETWORKS: 'All networks',
  FAVORITE_NETWORKS: 'Favorite networks',
  POPULAR_NETWORKS: 'Popular networks',
}));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left === right }));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: (_wallet: unknown, network: string) => network,
  },
}));
vi.mock('@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue', () => ({ default: {} }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

const mountPortfolio = () =>
  mount(Currencies, {
    props: {
      balances: [],
      filterValue: '',
      showAssetsManagementForm: false,
    },
    global: {
      stubs: {
        Icon: { template: '<span />' },
        Loader: { template: '<span />' },
        PortfolioNetworkSection: { template: '<section />' },
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

    const wrapper = mountPortfolio();
    const refresh = wrapper.get('[data-testid="portfolioRefresh"]');

    await refresh.trigger('click');
    await (wrapper.vm as InstanceType<typeof Currencies>).refreshPortfolio();

    expect(mocks.forceAssetDiscoverySweep).toHaveBeenCalledTimes(1);
    expect(mocks.fetchNfts).toHaveBeenCalledWith('0x0000000000000000000000000000000000000001');
    expect(refresh.attributes('aria-busy')).toBe('true');
    expect(refresh.text()).toBe('Syncing');

    completeSweep?.();
    await flushPromises();

    expect(refresh.attributes('aria-busy')).toBe('false');
    expect(refresh.text()).toBe('Refresh');
  });
});
