import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import CircleButton from '@/components/CircleButton.vue';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
const boundary = vi.hoisted(() => ({ accounts: null as any, networks: null as any }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/stores/sendKillSwitch', () => ({ useSendKillSwitchStore: () => ({ vetoes: {} }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'history', AssetNetworks: 'networks', SendForm: 'send', ReceiveForm: 'receive' } }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: (name: string) => name === 'Ethereum' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const wrappers: VueWrapper[] = [];
function network(name: string, extra = {}) { return { name, active: true, ecosystem: 'substrate', chainId: name.toLowerCase(), favorite: ['alice'], networkStatus: NETWORK_STATUS.CONNECTED, ...extra }; }
function row(name = 'Polkadot', extra = {}) { return { name, id: 'dot', symbol: 'dot', icon: '/dot.svg', state: APIItemState.READY, transferable: '2', total: '2', ...extra }; }
function asset(extra = {}) { return { groupId: 'dot', tokenName: 'Polkadot', symbol: 'dot', priceId: 'dot', icon: '/dot.svg', relayChain: 'polkadot', mainNetwork: 'Polkadot', balances: [row()], ...extra }; }
beforeEach(() => {
  boundary.accounts = reactive({ selectedWallet: { address: 'alice', hasEthereum: true, isMobile: false }, accounts: [{ address: 'alice' }], hiddenAssets: [], fiatSymbol: '$', setHiddenAssets: vi.fn() });
  boundary.networks = reactive({ values: [network('Polkadot', { rank: 1 }), network('Ethereum', { ecosystem: 'ethereum', favorite: [] })], price: { price: 3, priceChange: 0.12, isExist: true },
    getNetwork(name: string) { return this.values.find((entry: { name: string }) => entry.name === name); },
    getAssetPrice() { return this.price; }, get favoriteNetworksNames() { return this.values; },
  });
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
function render(props = {}) {
  const push = vi.fn();
  const wrapper = mount(CurrencyItem, { props: { assetData: asset(), selectedNetwork: ALL_NETWORKS, ...props }, global: { mocks: { $n: (value: number) => String(value), $router: { push } },
    components: { CircleButton }, stubs: { LazyRender: { template: '<div><slot /></div>' }, ExternalLogo: true, Icon: { template: '<svg><path d="M0 0h1" /></svg>' }, Tooltip: true, Shimmer: true, Switcher: { props: ['value'], template: '<input type="checkbox" :checked="value" @change="$emit(\'change\', $event.target.checked)" />' } } },
  });
  wrappers.push(wrapper); return { wrapper, vm: wrapper.vm as any, push };
}
describe('wallet asset list rows', () => {
  it('renders token balance, price and change from the selected wallet', () => {
    const { wrapper } = render();
    expect(wrapper.get('[data-testid="tokenName"]').text()).toBe('POLKADOT');
    expect(wrapper.get('[data-testid="currencyName"]').text()).toBe('DOT');
    expect(wrapper.get('[data-testid="countAssets"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="totalBalance"]').text()).toBe('$6');
    expect(wrapper.get('[data-testid="changePrice"]').classes()).toContain('up-price');
  });
  it('updates negative/flat price moves and hides the price row when unavailable', async () => {
    const { wrapper } = render(); boundary.networks.price.priceChange = -0.2; await flushPromises();
    expect(wrapper.get('[data-testid="changePrice"]').classes()).toContain('down-price');
    boundary.networks.price.priceChange = 0; await flushPromises(); expect(wrapper.get('[data-testid="changePrice"]').text()).toBe('');
    boundary.networks.price.isExist = false; await flushPromises(); expect(wrapper.find('[data-testid="price"]').exists()).toBe(false);
  });
  it('shows pending balance placeholders, then disconnect warnings without stale totals', async () => {
    const { wrapper, vm } = render({ assetData: asset({ balances: [row('Polkadot', { state: APIItemState.PENDING })] }) });
    expect(vm.showShimmers).toBe(true); expect(wrapper.find('[data-testid="countAssets"]').exists()).toBe(false);
    boundary.networks.values[0].networkStatus = NETWORK_STATUS.DISCONNECTED; await flushPromises();
    expect(vm.showShimmers).toBe(false); expect(vm.showWarning).toBe(true); expect(wrapper.find('[data-testid="receiveBtn"]').exists()).toBe(false);
  });
  it('hides hidden assets outside management, and emits the explicit visibility setting in management', async () => {
    boundary.accounts.hiddenAssets = ['dot']; const { wrapper } = render();
    expect(wrapper.find('[data-testid="tokenName"]').exists()).toBe(false);
    await wrapper.setProps({ showAssetsManagementForm: true }); expect(wrapper.find('[data-testid="tokenName"]').exists()).toBe(true);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(boundary.accounts.setHiddenAssets).toHaveBeenCalledWith({ groupId: 'dot', value: true });
  });
  it('opens history for one network and the network picker for multiple live networks', async () => {
    const { wrapper, push } = render(); await wrapper.get('[data-testid="tokenName"]').trigger('click');
    expect(push).toHaveBeenLastCalledWith({ name: 'history', params: { assetId: 'dot', selectedNetwork: 'Polkadot' } });
    await wrapper.setProps({ assetData: asset({ balances: [row(), row('Ethereum')] }) });
    await wrapper.get('[data-testid="tokenName"]').trigger('click');
    expect(push).toHaveBeenLastCalledWith({ name: 'networks', params: { assetId: 'dot' } });
  });
  it.each(['send', 'receive'])('routes nested %s button artwork only once', async action => {
    const { wrapper, push } = render(); await wrapper.get(`[data-testid="${action}Btn"] path`).trigger('click');
    expect(push).toHaveBeenCalledExactlyOnceWith({ name: action, params: { assetId: 'dot', network: 'Polkadot' } });
  });
  it('keeps the details button navigation available', async () => {
    const { wrapper, push } = render(); await wrapper.get('[data-testid="detailsBtn"] path').trigger('click');
    expect(push).toHaveBeenCalledExactlyOnceWith({ name: 'history', params: { assetId: 'dot', selectedNetwork: 'Polkadot' } });
  });
  it.each([POPULAR_NETWORKS, FAVORITE_NETWORKS, 'Polkadot'])('filters badges and routing for the %s scope', selection => {
    const { vm } = render({ selectedNetwork: selection, assetData: asset({ balances: [row(), row('Ethereum')] }) });
    expect(vm.activeNetworks.map((item: { name: string }) => item.name)).toEqual(selection === 'Polkadot' ? ['Polkadot','Ethereum'] : ['Polkadot']);
    if (selection === 'Polkadot') expect(vm.networkBadges.map((item: { name: string }) => item.name)).toEqual(['Polkadot']);
  });
  it('restricts mobile badges to the account-approved chains and collapses many badges', () => {
    boundary.accounts.selectedWallet.isMobile = true; boundary.accounts.accounts[0].chains = ['polkadot'];
    const { vm } = render({ assetData: asset({ balances: [row(), row('Ethereum')] }) });
    expect(vm.filteredBalances.map((item: { name: string }) => item.name)).toEqual(['Polkadot']);
    boundary.accounts.selectedWallet.isMobile = false;
    const balances = Array.from({ length: 6 }, (_, index) => row(`Network ${index}`));
    boundary.networks.values = balances.map(item => network(item.name));
    const many = render({ assetData: asset({ mainNetwork: 'Network 0', balances }) });
    expect(many.vm.networkBadges).toHaveLength(4); expect(many.vm.additionalCount).toBe(2);
  });
  it('tolerates an inactive EVM asset and prevents sending through an unavailable network', () => {
    boundary.networks.values[1].active = false;
    const { vm, push } = render({ assetData: asset({ symbol: 'eth', relayChain: 'ethereum', mainNetwork: 'Ethereum', balances: [row('Ethereum')] }) });
    expect(vm.showSendButton).toBe(false); vm.onRoute('send'); expect(push).not.toHaveBeenCalled();
  });
  it('ignores a saved balance whose network has been removed from the registry', () => {
    const { vm } = render({ assetData: asset({ balances: [row(), row('Removed')] }) });
    expect(vm.transferableAssetBalance).toBe(2); expect(vm.activeNetworks.map((item: { name: string }) => item.name)).toEqual(['Polkadot']);
  });
  it('falls back to the symbol when a catalog entry has no token name', () => {
    const { wrapper } = render({ assetData: asset({ tokenName: undefined }) });
    expect(wrapper.get('[data-testid="tokenName"]').text()).toBe('DOT');
  });
});
