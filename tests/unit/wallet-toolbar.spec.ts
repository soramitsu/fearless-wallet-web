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
  'portfolioPage.showingFiltered': 'Showing {network} · {value}',
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

const mountWallet = ({ push = vi.fn(() => Promise.resolve()) } = {}) =>
  mount(Wallet, {
    global: {
      mocks: { $t: translate, $route: { name: 'currencies', params: {} }, $router: { push, replace: vi.fn() } },
      stubs: {
        ContentForm: { template: '<div><slot /></div>' },
        'router-view': true,
        Loading: true,
        Tooltip: true,
        TabButton: true,
        SearchInput: true,
        CircleButton: true,
      },
    },
  });

describe('the wallet toolbar and the filtered header caption', () => {
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

  it('opens Manage assets as a page of its own, with no switches or filters left in the toolbar', async () => {
    const accountsStore = useAccountsStore();
    const setAssetPreference = vi.spyOn(accountsStore, 'setAssetPreference');
    const setAssetPreferences = vi.spyOn(accountsStore, 'setAssetPreferences');
    const push = vi.fn(() => Promise.resolve());
    const wrapper = mountWallet({ push });

    await wrapper.get('[data-testid="filterBtn"]').trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'ManageAssets' });
    // "Hide zero balances", the Hidden chip and the Testnets chip are gone from the wallet screen: what the list shows
    // is chosen on the Manage assets page.
    ['hideZeroToggle', 'filterHidden', 'filterTestnets', 'portfolioSort', 'portfolioLens'].forEach((testId) =>
      expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(false)
    );
    expect(setAssetPreference).not.toHaveBeenCalled();
    expect(setAssetPreferences).not.toHaveBeenCalled();
    expect(storage.getItem('account_asset-preferences-v1')).toBeNull();
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

  it('says the total leaves out a balance nobody could load, instead of passing it off as the whole', async () => {
    const accountsStore = useAccountsStore();
    const groups = balances();
    // Kusama's first update failed: the background keeps the item without an amount.
    groups
      .flatMap((group) => group.balances)
      .filter((balance) => balance.name === 'kusama' && balance.symbol === 'ksm')
      .forEach((balance) => Object.assign(balance, { state: APIItemState.ERROR }));
    accountsStore.setBalance({ details: groups });
    const wrapper = mountWallet();

    expect(wrapper.get('[data-testid="fiatBalance"]').text()).toBe('2,010.00');
    expect(wrapper.get('[data-testid="balanceCaption"]').text()).toBe('portfolioPage.balanceStatus.failed');

    accountsStore.setSelectedNetwork('Polkadot');
    await nextTick();
    expect(wrapper.get('[data-testid="balanceCaption"]').text()).toBe('Showing Polkadot · 10.00 · portfolioPage.balanceStatus.failed');
    wrapper.unmount();
  });
});
