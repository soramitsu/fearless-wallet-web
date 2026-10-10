import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { EVM_ADDRESS, SUBSTRATE_ADDRESS, networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

vi.mock('@/extension/messaging', () => ({
  fetchEvmBalance: vi.fn(),
  getHistory: vi.fn(),
  sendMessage: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: { Currencies: 'currencies', Nfts: 'nfts', AssetHistory: 'AssetHistory' } }));
vi.mock('@/screens/wallet&asset/SendForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/ReceiveForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/wallet/NetworkManagement.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/wallet/GoogleExportPopup.vue', () => ({ default: { template: '<div />' } }));

import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const translations: Record<string, string> = {
  'wallet.hideZero': 'Hide zero balances',
  'portfolioPage.showingFiltered': 'Showing {network} · {value}',
  'portfolioPage.filterHidden': 'Hidden ({count})',
  'portfolioPage.testnets': 'Testnets',
};
const translate = (key: string, values: Record<string, unknown> = {}) =>
  (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));

const networkMap = networkMap305(readSnapshot());
const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];

function balances(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  const fund = (networkName: string, symbol: string, amount: string) =>
    groups
      .flatMap((group) => group.balances)
      .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol)
      .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));

  fund('Polkadot', 'dot', '2');
  fund('Ethereum', 'eth', '1');
  return groups;
}

const mountWallet = () =>
  mount(Wallet, {
    global: {
      mocks: { $t: translate, $route: { name: 'currencies', params: {} }, $router: { push: vi.fn(), replace: vi.fn() } },
      stubs: {
        ContentForm: { template: '<div><slot /></div>' },
        'router-view': true,
        Loading: true,
        Tooltip: true,
        TabButton: true,
        SearchInput: true,
        CircleButton: true,
        Switcher: {
          props: ['value', 'activeText'],
          emits: ['change'],
          template: '<button type="button" class="switcher-stub" :aria-pressed="value" @click="$emit(\'change\', !value)">{{ activeText }}</button>',
        },
      },
    },
  });

describe('Hide zero balances and the filtered header caption', () => {
  let storage: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const networksStore = useNetworksStore();
    networksStore.allNetworks = networks;
    networksStore.setPrices({ tokenPriceMap: { polkadot: 5, ethereum: 2000 }, tokenPriceChange: {} });
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet({
      address: SUBSTRATE_ADDRESS,
      ethereumAddress: EVM_ADDRESS,
      name: 'wallet',
      walletEcosystem: WalletEcosystem.Substrate,
    } as AccountJson);
    accountsStore.setBalance({ details: balances() });
    accountsStore.setIsBalanceLoading(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('flips only the per-wallet view setting and never writes an asset preference', async () => {
    const accountsStore = useAccountsStore();
    const setAssetPreference = vi.spyOn(accountsStore, 'setAssetPreference');
    const setAssetPreferences = vi.spyOn(accountsStore, 'setAssetPreferences');
    const wrapper = mountWallet();

    const toggle = wrapper.get('[data-testid="hideZeroToggle"] .switcher-stub');
    expect(toggle.text()).toBe('Hide zero balances');
    await toggle.trigger('click');

    expect(setAssetPreference).not.toHaveBeenCalled();
    expect(setAssetPreferences).not.toHaveBeenCalled();
    expect(accountsStore.portfolioView.hideZero).toBe(true);
    expect(JSON.parse(storage.getItem('account_portfolio-view-v1')!)).toEqual({
      value: { [SUBSTRATE_ADDRESS]: expect.objectContaining({ hideZero: true }) },
    });
    expect(storage.getItem('account_asset-preferences-v1')).toBeNull();

    await toggle.trigger('click');
    expect(accountsStore.portfolioView.hideZero).toBe(false);
    wrapper.unmount();
  });

  it('keeps the header wallet-wide under a network filter and captions the filtered part', async () => {
    const accountsStore = useAccountsStore();
    const wrapper = mountWallet();

    expect(wrapper.get('[data-testid="fiatBalance"]').text()).toBe('2,010.00');
    expect(wrapper.find('[data-testid="balanceCaption"]').exists()).toBe(false);

    accountsStore.setSelectedNetwork('Polkadot');
    await nextTick();
    expect(wrapper.get('[data-testid="fiatBalance"]').text()).toBe('2,010.00');
    expect(wrapper.get('[data-testid="balanceCaption"]').text()).toBe('Showing Polkadot · 10.00');
    wrapper.unmount();
  });

  it('offers the Hidden filter and the Testnets switch in Manage, persisting Testnets per wallet', async () => {
    const accountsStore = useAccountsStore();
    const wrapper = mountWallet();

    await wrapper.get('[data-testid="filterBtn"]').trigger('click');
    expect(wrapper.find('[data-testid="hideZeroToggle"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="filterHidden"]').text()).toBe('Hidden (0)');

    await wrapper.get('[data-testid="filterHidden"]').trigger('click');
    expect(wrapper.get('[data-testid="filterHidden"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[data-testid="filterTestnets"]').trigger('click');
    expect(accountsStore.portfolioView.showTestnets).toBe(true);

    // Leaving Manage drops the Hidden filter; the Testnets choice stays.
    await wrapper.get('[data-testid="filterBtn"]').trigger('click');
    await wrapper.get('[data-testid="filterBtn"]').trigger('click');
    expect(wrapper.get('[data-testid="filterHidden"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[data-testid="filterTestnets"]').attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });
});
