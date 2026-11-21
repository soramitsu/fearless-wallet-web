import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { createLocalStorageStub, homeBalances as balances, openHomeWallet } from './support/walletHome';
import { useAccountsStore } from '@/stores/accounts';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const recovery = vi.hoisted(() => ({ only: false }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({
  Components: {
    AssetHistory: 'AssetHistory',
    Currencies: 'Currencies',
    Polkaswap: 'Polkaswap',
    ReceiveForm: 'ReceiveForm',
    SendForm: 'SendForm',
  },
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'shadow' } }) }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<typeof import('@/consts/global')>()), IS_EXTENSION: true }));
vi.mock('@/util/walletRecoveryPolicy', () => ({ isSelectedWalletRecoveryOnly: () => recovery.only }));

import TokenOverview from '@/screens/portfolio/TokenOverview.vue';
import { useWalletTokenRows } from '@/portfolio/useWalletTokenRows';

const openWallet = (groups: Parameters<typeof openHomeWallet>[0], options: { hideZero?: boolean } = {}) =>
  openHomeWallet(groups, { ...options, priceChanges: { polkadot: 2.5 } });

const wrappers: VueWrapper[] = [];
const mountPage = (token: string, search = '') => {
  const wrapper = mount(TokenOverview, {
    props: { token, search },
    global: {
      stubs: { teleport: true, ExternalLogo: true, Icon: true, Shimmer: true },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const networkRows = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="tokenNetworkRow"]').map((row) => row.attributes('data-network'));

describe("a token's own page", () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    router.push.mockReset();
    recovery.only = false;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds up the token across its networks and lists where it is, largest first', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5', '4.2'], ['Polkadot AssetHub', 'dot', '2'], ['Ethereum', 'eth', '0.75']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    expect(wrapper.get('.head-symbol').text()).toBe('DOT');
    expect(wrapper.get('[data-testid="tokenTotal"]').text()).toBe('14.5000 DOT');
    // $72.50 of $1,572.50: the token's share of the wallet, which counts the same priced holdings.
    expect(wrapper.get('[data-testid="tokenValue"]').text()).toContain('$72.50');
    expect(wrapper.get('[data-testid="tokenValue"]').text()).toContain('walletHome.token.share {"percent":"5"}');
    expect(wrapper.get('[data-testid="tokenUnitPrice"]').text()).toContain('walletHome.token.price {"symbol":"DOT","price":"$5.00"}');
    expect(wrapper.get('[data-testid="tokenUnitPrice"]').text()).toContain('+2.5%');
    expect(networkRows(wrapper)).toEqual(['Polkadot', 'Polkadot AssetHub']);
    // What can be sent now, where it differs from what is held.
    expect(wrapper.findAll('[data-testid="networkAvailable"]').map((note) => note.text())).toEqual([
      'walletHome.token.available {"amount":"4.2000 DOT"}',
    ]);
  });

  it('keeps networks with no balance behind one line until asked', async () => {
    // ETH on Arbitrum One, OP Mainnet and Polygon zkEVM are shown at zero by the one zero rule.
    openWallet(balances([['Ethereum', 'eth', '0.75']]));
    const wrapper = mountPage('group:eth');
    await flushPromises();
    const toggle = wrapper.get('[data-testid="tokenZeroToggle"]');

    expect(networkRows(wrapper)).toEqual(['Ethereum']);
    expect(toggle.text()).toBe('walletHome.token.showZero:3');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');

    expect(networkRows(wrapper)).toHaveLength(4);
    expect(networkRows(wrapper)[0]).toBe('Ethereum');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.text()).toBe('walletHome.token.hideZero');
  });

  it('opens a network on its own asset page', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    await wrapper.findAll('[data-testid="tokenNetworkRow"]')[1].trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AssetHistory',
      params: { assetId: expect.any(String), selectedNetwork: 'Polkadot AssetHub' },
    });
  });

  it('asks for the network before Send, with the warning, and opens Send on the network picked', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    await wrapper.get('[data-testid="tokenSend"]').trigger('click');
    const options = wrapper.findAll('[data-testid="groupNetworkOption"]');

    expect(wrapper.find('[data-testid="groupNetworkWarning"]').exists()).toBe(true);
    expect(options.map((option) => option.attributes('data-network'))).toEqual(['Polkadot', 'Polkadot AssetHub']);
    expect(router.push).not.toHaveBeenCalled();

    await options[1].trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      name: 'SendForm',
      params: { assetId: expect.any(String), network: 'Polkadot AssetHub' },
    });
    expect(wrapper.find('[data-testid="groupNetworkPicker"]').exists()).toBe(false);
  });

  it('offers Receive on every network of the token, those it holds nothing on included', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    await wrapper.get('[data-testid="tokenReceive"]').trigger('click');
    const offered = wrapper.findAll('[data-testid="groupNetworkOption"]').map((option) => option.attributes('data-network'));

    expect(offered[0]).toBe('Polkadot');
    expect(offered).toContain('Polkadot AssetHub');

    await wrapper.findAll('[data-testid="groupNetworkOption"]')[0].trigger('click');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'ReceiveForm', params: { assetId: expect.any(String), network: 'Polkadot' } });
  });

  it('opens Polkaswap from Swap', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    await wrapper.get('[data-testid="tokenSwap"]').trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'Polkaswap' });
  });

  it('offers neither Receive nor Swap to a recovery-only wallet, which may still send its funds away', async () => {
    recovery.only = true;
    openWallet(balances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const wrapper = mountPage('group:dot');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="tokenActions"] button').map((button) => button.attributes('data-testid'))).toEqual(['tokenSend']);
  });

  it('still opens a group that the filters leave on one network', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5']]), { hideZero: true });
    const wrapper = mountPage('group:dot');
    await flushPromises();

    expect(wrapper.get('[data-testid="tokenTotal"]').text()).toBe('12.5000 DOT');
    expect(networkRows(wrapper)).toEqual(['Polkadot']);
    expect(wrapper.find('[data-testid="tokenZeroToggle"]').exists()).toBe(false);
  });

  it('says when the token is not in the wallet, and leads back to the assets', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5']]));
    const wrapper = mountPage('group:not-a-token');
    await flushPromises();

    expect(wrapper.find('[data-testid="tokenOverviewNotFound"]').text()).toContain('walletHome.token.notFound');
    await wrapper.get('[data-testid="tokenOverviewNotFound"] button').trigger('click');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'Currencies' });
  });

  it('waits while the balances load instead of saying the token is gone', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5']]));
    useAccountsStore().setIsBalanceLoading(true);
    const wrapper = mountPage('group:not-loaded-yet');
    await flushPromises();

    expect(wrapper.find('[data-testid="tokenOverviewLoading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tokenOverviewNotFound"]').exists()).toBe(false);
  });

  it('lists the hidden networks a search found, and shows again only the one opened', async () => {
    openWallet(balances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const accounts = useAccountsStore();
    const scope = effectScope();
    const { findRow } = scope.run(() => useWalletTokenRows())!;
    const [relay, hub] = findRow('group:dot')!.children.map(({ asset }) => asset.key);
    scope.stop();
    accounts.setAssetPreferences({ entries: [relay, hub].map((key) => ({ key, preference: 'hidden' as const })) });

    // Hidden everywhere: the plain page has nothing to show for it.
    const plain = mountPage('group:dot');
    await flushPromises();
    expect(plain.find('[data-testid="tokenOverviewNotFound"]').exists()).toBe(true);

    const wrapper = mountPage('group:dot', 'DOT');
    await flushPromises();
    expect(networkRows(wrapper)).toEqual(['Polkadot', 'Polkadot AssetHub']);

    await wrapper.get('[data-testid="tokenNetworkRow"][data-network="Polkadot AssetHub"]').trigger('click');

    expect(accounts.assetPreferences[hub] ?? 'auto').toBe('auto');
    expect(accounts.assetPreferences[relay]).toBe('hidden');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'AssetHistory', params: { assetId: expect.any(String), selectedNetwork: 'Polkadot AssetHub' } });
  });

  it('names a balance nobody could load as failed, never as zero', async () => {
    const groups = balances([['Polkadot', 'dot', '12.5']]);
    groups
      .flatMap(({ balances: items }) => items)
      .filter((item) => item.name === 'polkadot assethub' && item.symbol === 'dot')
      .forEach((item) => Object.assign(item, { state: APIItemState.ERROR, total: undefined, free: undefined, transferable: undefined }));
    openWallet(groups);
    const wrapper = mountPage('group:dot');
    await flushPromises();
    const hub = wrapper.get('[data-testid="tokenNetworkRow"][data-network="Polkadot AssetHub"]');

    expect(hub.get('[data-testid="networkBalanceUnavailable"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(hub.text()).not.toContain('0.0000 DOT');
    expect(hub.attributes('aria-label')).toContain('portfolioPage.tokenSingleFailedLabel');
    // The total is what could be read, marked as out of date.
    expect(wrapper.get('[data-testid="tokenTotal"]').text()).toBe('12.5000 DOT');
    expect(wrapper.get('[data-testid="tokenBalanceFailed"]').text()).toBe('portfolioPage.balanceStatus.failed');
  });
});
