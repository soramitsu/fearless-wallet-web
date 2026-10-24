import { mount } from '@vue/test-utils';
import { APIItemState } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import english from '@/locales/en/translation.json';

const translate = (key: string): string => {
  let value: unknown = english;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : key;
};

const networks = [
  {
    assets: [{ id: 'BTC', isNative: true, name: 'Bitcoin', priceId: 'bitcoin', symbol: 'BTC' }],
    chainId: 'bitcoin-mainnet',
    ecosystem: 'bitcoin',
    favorite: [],
    icon: 'btc',
    name: 'Bitcoin',
  },
  {
    assets: [
      { id: 'pol', isNative: true, isUtility: true, name: 'Polygon Ecosystem Token', priceId: 'pol', symbol: 'pol' },
      { id: '0xWbtc', name: 'wrapped btc', priceId: 'wbtc', symbol: 'wbtc' },
    ],
    chainId: '137',
    ecosystem: 'ethereum',
    favorite: [],
    icon: 'polygon',
    name: 'Polygon',
    rank: 3,
  },
] as unknown as NetworkJson[];

const holding = (network: NetworkJson, assetId: string, total: string): TokenGroup => {
  const asset = network.assets.find(({ id }) => id === assetId)!;

  return {
    balances: [{
      assetMetadataSource: 'registry',
      assetMetadataTrust: 'verified',
      icon: network.icon,
      id: assetId,
      isNative: asset.isNative,
      isUtility: asset.isUtility,
      name: network.name.toLowerCase(),
      precision: 8,
      priceId: asset.priceId,
      state: APIItemState.READY,
      symbol: asset.symbol,
      total,
      transferable: total,
    } as BalanceItem],
    groupId: assetId,
    icon: network.icon,
    mainNetwork: network.name,
    priceId: asset.priceId,
    providers: [],
    relayChain: network.ecosystem as never,
    symbol: asset.symbol,
    tokenName: asset.name,
  } as TokenGroup;
};

const mocks = vi.hoisted(() => ({
  accountsStore: {
    assetPreferences: {},
    balances: [] as TokenGroup[],
    fiatSymbol: '$',
    isBalanceLoading: false,
    migrateLegacyAssetPreferences: vi.fn(),
    networkScanStates: {},
    selectedNetwork: 'all',
    selectedWallet: { address: 'substrate-address', ethereumAddress: '0x0000000000000000000000000000000000000001' },
    setAssetPreference: vi.fn(),
  },
  networksStore: {
    allNetworks: [] as NetworkJson[],
    assetsPrice: { tokenPriceMap: { bitcoin: 60_000, pol: 5, wbtc: 60_000 } },
    getNetwork: vi.fn(),
    loadIndexerNetworkBalance: vi.fn(),
  },
  push: vi.fn(),
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => mocks.networksStore }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: {} }) }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/helpers', () => ({
  isSameString: (left?: string, right?: string) => String(left).toLowerCase() === String(right).toLowerCase(),
}));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: (_wallet: unknown, network: string) => `${network} address` } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: translate, tc: translate }) }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

const mountPortfolio = (filterValue: string, showAssetsManagementForm = false) =>
  mount(Currencies, {
    props: { balances: [], filterValue, showAssetsManagementForm },
    global: {
      mocks: { $t: translate },
      stubs: {
        ExternalLogo: true,
        Icon: true,
        Loader: true,
        Scroll: { template: '<main><slot /></main>' },
        Switcher: true,
      },
    },
  });
const listed = (wrapper: ReturnType<typeof mountPortfolio>): string[] =>
  wrapper.findAll('.network-section').map((section) =>
    [section.get('.network-title').text(), ...section.findAll('.asset-balance').map((row) => row.text())].join(' | ')
  );

describe('Portfolio search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.networksStore.allNetworks = networks;
    mocks.accountsStore.balances = [
      holding(networks[0], 'BTC', '0'),
      holding(networks[1], 'pol', '10'),
      holding(networks[1], '0xWbtc', '0'),
    ];
  });

  it('shows a supported token the wallet holds none of, at 0', () => {
    const wrapper = mountPortfolio('btc');

    expect(wrapper.find('[data-testid="infoText"]').exists()).toBe(false);
    expect(listed(wrapper)).toEqual(['Bitcoin | 0 BTC$0.00', 'Polygon | 0 WBTC$0.00']);
    wrapper.unmount();
  });

  it('says nothing matches only when no supported token does', () => {
    const wrapper = mountPortfolio('zzz');

    expect(wrapper.get('[data-testid="infoText"]').text()).toBe('No matching assetsTry another asset or network name.');
    wrapper.unmount();
  });

  it('keeps the plain list without a search and in Manage, whatever was typed before', () => {
    const plain = mountPortfolio('');
    const manage = mountPortfolio('btc', true);

    expect(listed(plain)).toEqual(['Polygon | 10.0000 POL$50.00']);
    expect(listed(manage)).toEqual(listed(plain));
    plain.unmount();
    manage.unmount();
  });
});
