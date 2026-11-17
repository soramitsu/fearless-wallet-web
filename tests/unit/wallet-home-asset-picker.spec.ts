import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createLocalStorageStub, homeBalances, openHomeWallet } from './support/walletHome';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({ Components: { ReceiveForm: 'ReceiveForm', SendForm: 'SendForm' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'shadow' } }) }));

import AssetPickerSheet from '@/screens/portfolio/AssetPickerSheet.vue';

const SearchInput = {
  name: 'SearchInput',
  props: ['value', 'placeholder', 'width'],
  emits: ['change'],
  template: '<input class="search-stub" :value="value" @input="$emit(\'change\', $event.target.value)" />',
};

const wrappers: VueWrapper[] = [];
const mountPicker = (action: 'send' | 'receive') => {
  const wrapper = mount(AssetPickerSheet, {
    props: { action },
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { teleport: true, ExternalLogo: true, Icon: true, SearchInput },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const offered = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="assetPickerOption"]').map((option) => option.attributes('data-token'));

describe('the Send and Receive pickers of the wallet home', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    router.push.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists only what can be sent, largest first, and asks for the network of a token on several', async () => {
    openHomeWallet(homeBalances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2'], ['Kusama', 'ksm', '3']]));
    const wrapper = mountPicker('send');
    await flushPromises();

    expect(offered(wrapper)).toEqual(['group:dot', expect.stringMatching(/^substrate:/)]);
    expect(wrapper.findAll('[data-testid="assetPickerOption"]').map((option) => option.attributes('data-symbol'))).toEqual(['DOT', 'KSM']);

    await wrapper.get('[data-testid="assetPickerOption"][data-token="group:dot"]').trigger('click');

    // One sheet at a time: the network question takes the token list's place.
    expect(wrapper.find('[data-testid="assetPicker"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="groupNetworkWarning"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="groupNetworkOption"]').map((option) => option.attributes('data-network'))).toEqual([
      'Polkadot',
      'Polkadot AssetHub',
    ]);

    await wrapper.findAll('[data-testid="groupNetworkOption"]')[0].trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'SendForm', params: { assetId: expect.any(String), network: 'Polkadot' } });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('opens Send at once for a token on one network, which the next screen names', async () => {
    openHomeWallet(homeBalances([['Kusama', 'ksm', '3']]));
    const wrapper = mountPicker('send');
    await flushPromises();

    await wrapper.get('[data-testid="assetPickerOption"][data-symbol="KSM"]').trigger('click');

    expect(wrapper.find('[data-testid="groupNetworkPicker"]').exists()).toBe(false);
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'SendForm', params: { assetId: expect.any(String), network: 'Kusama' } });
  });

  it('brings the token list back when the network question is closed', async () => {
    openHomeWallet(homeBalances([['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'dot', '2']]));
    const wrapper = mountPicker('send');
    await flushPromises();

    await wrapper.get('[data-testid="assetPickerOption"][data-token="group:dot"]').trigger('click');
    await wrapper.get('[data-testid="groupNetworkPickerClose"]').trigger('click');

    expect(wrapper.find('[data-testid="assetPicker"]').exists()).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says there is nothing to send yet in an empty wallet, and how to start', async () => {
    openHomeWallet(homeBalances([]));
    const wrapper = mountPicker('send');
    await flushPromises();

    expect(offered(wrapper)).toEqual([]);
    expect(wrapper.get('[data-testid="assetPickerEmpty"]').text()).toContain('walletHome.picker.emptySend');
    expect(wrapper.get('[data-testid="assetPickerEmpty"]').text()).toContain('walletHome.picker.emptySendHint');
  });

  it('offers networks for a first deposit and opens Receive with just the chosen network', async () => {
    openHomeWallet(homeBalances([]));
    const wrapper = mountPicker('receive');
    await flushPromises();

    const networks = wrapper.findAll('[data-testid="receiveNetworkOption"]').map((option) => option.text());
    expect(networks).toEqual(expect.arrayContaining(['Polkadot', 'Polkadot AssetHub', 'Kusama']));
    expect(new Set(networks).size).toBe(networks.length);
    expect(offered(wrapper)).toEqual([]);

    await wrapper.get('[data-testid="receiveNetworkOption"][data-network="Polkadot AssetHub"]').trigger('click');
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'ReceiveForm', params: { network: 'Polkadot AssetHub' } });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('searches Receive by network name and recovers from an empty search result', async () => {
    openHomeWallet(homeBalances([['Polkadot', 'dot', '12.5']]));
    const wrapper = mountPicker('receive');
    await flushPromises();

    await wrapper.get('.search-stub').setValue('  pOLkadot aSsEtHub  ');
    expect(wrapper.findAll('[data-testid="receiveNetworkOption"]').map((option) => option.text())).toEqual(['Polkadot AssetHub']);

    await wrapper.get('.search-stub').setValue('no such network');
    expect(wrapper.find('[data-testid="receiveNetworkOption"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="assetPickerEmpty"]').text()).toContain('walletHome.picker.noNetworkMatch');

    await wrapper.get('.search-stub').setValue('');
    expect(wrapper.find('[data-testid="receiveNetworkOption"][data-network="Kusama"]').exists()).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('offers only the wallet’s networks even before balances load', async () => {
    const { accountsStore } = openHomeWallet([]);
    accountsStore.setSelectedWallet({ ...accountsStore.accounts[0], ethereumAddress: '' });
    const wrapper = mountPicker('receive');
    await flushPromises();

    const networks = wrapper.findAll('[data-testid="receiveNetworkOption"]').map((option) => option.text());
    expect(networks).toContain('Polkadot');
    expect(networks).not.toContain('Ethereum');
    expect(networks).not.toContain('Moonbeam');
    expect(networks).not.toContain('TON Mainnet');
  });

  it('closes when its sheet is closed', async () => {
    openHomeWallet(homeBalances([['Polkadot', 'dot', '12.5']]));
    const wrapper = mountPicker('send');
    await flushPromises();

    await wrapper.get('[data-testid="portfolioSheetClose"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
