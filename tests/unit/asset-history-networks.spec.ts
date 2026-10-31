import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import History from '@/screens/wallet&asset/asset/History.vue';
import AssetNetworks from '@/screens/wallet&asset/asset/AssetNetworks.vue';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { Components } from '@/router/routes';
const boundary = vi.hoisted(() => ({ accounts: null as any, networks: null as any, route: null as any, fetch: vi.fn(), fetchEvm: vi.fn(), push: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/extension/messaging', () => ({ fetchEvmBalance: boundary.fetchEvm }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: (name: string) => name === 'ethereum', isEthereumNativeNetwork: (name: string) => name === 'ethereum', isBitcoinNetwork: (name: string) => name === 'bitcoin', isSolanaNetwork: (name: string) => name.startsWith('solana'), formatAddress: () => 'bitcoin-address', encodeAddress: (address: string, prefix: number) => `${prefix}:${address}` } }));
vi.mock('@/screens/wallet&asset/asset/HistoryItem.vue', () => ({ default: { name: 'HistoryItem', props: ['historyElement'], template: '<div>{{ historyElement.id }}</div>' } }));
vi.mock('@/screens/wallet&asset/asset/AssetRow.vue', () => ({ default: { name: 'AssetRow', props: ['text', 'value', 'price'], template: '<div>{{ text }} {{ value }} {{ price }}</div>' } }));
const wrappers: VueWrapper[] = [];
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
let registry: Record<string, any>;
beforeEach(() => {
  vi.useFakeTimers(); boundary.fetch.mockReset().mockResolvedValue(undefined); boundary.fetchEvm.mockReset(); boundary.push.mockReset();
  registry = { polkadot: { name: 'polkadot', active: true, addressPrefix: 0, rank: 2, favorite: ['alice'] }, ethereum: { name: 'ethereum', active: true, rank: 1, favorite: [] }, kusama: { name: 'kusama', active: false, favorite: [] }, 'solana-devnet': { name: 'solana-devnet', chainId: 'devnet', active: true } };
  boundary.accounts = reactive({ selectedWallet: { address: 'alice', ethereumAddress: 'evm-address', solanaAddress: 'solana-address', isTon: false }, balances: [{ groupId: 'dot', balances: [{ name: 'polkadot', isUtility: true }] }], selectedNetwork: ALL_NETWORKS, fiatSymbol: '$' });
  boundary.networks = reactive({ history: { timestamp: 0, nodes: [{ id: 'sent', transfer: {} }, { id: 'reward', reward: {} }, { id: 'call', extrinsic: {} }] }, getHistory: () => boundary.networks.history, getNetwork: (name: string) => registry[name], getAssetPrice: () => ({ price: 2 }), fetchHistory: boundary.fetch });
  boundary.route = reactive({ params: { assetId: 'dot', selectedNetwork: 'polkadot' } });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllTimers(); vi.useRealTimers(); });
function form(kind: 'history' | 'networks' = 'history', currencyOverrides = {}) {
  const currency = { groupId: 'dot', symbol: 'dot', priceId: 'dot', mainNetwork: 'polkadot', balances: [{ name: 'polkadot', id: 'dot-native', transferable: '2', state: APIItemState.READY }, { name: 'ethereum', transferable: '4', state: APIItemState.READY }, { name: 'kusama', transferable: '100', state: APIItemState.READY }, { name: 'pending', transferable: '200', state: APIItemState.PENDING }], ...currencyOverrides };
  const wrapper = shallowMount(kind === 'history' ? History : AssetNetworks, { props: { currency }, global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key, $n: (value: number) => String(value), $route: boundary.route, $router: { push: boundary.push } }, stubs: { ContentForm: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' }, Fragment: { template: '<div><slot /></div>' }, Dropdown: true, Loader: true, TabButton: true, Icon: true, SelectPopup: true } } });
  wrappers.push(wrapper); return { wrapper, vm: wrapper.vm as any, currency };
}

describe('asset history lifecycle and filtering', () => {
  it('loads stale history, filters transfer/reward/extrinsic rows, and opens row details', async () => {
    const { wrapper, vm } = form(); await vi.advanceTimersByTimeAsync(300);
    expect(boundary.fetch).toHaveBeenCalledWith({ networkName: 'polkadot', assetId: 'dot' }); expect(vm.showLoader).toBe(false);
    expect(wrapper.findAllComponents({ name: 'HistoryItem' })).toHaveLength(3); vm.filterHistoryValueUpdate('reward'); await flushPromises();
    expect(wrapper.findAllComponents({ name: 'HistoryItem' })).toHaveLength(1); expect(wrapper.getComponent({ name: 'HistoryItem' }).props('historyElement').id).toBe('reward');
    vm.filterHistoryValueUpdate('extrinsic'); await flushPromises(); expect(wrapper.getComponent({ name: 'HistoryItem' }).props('historyElement').id).toBe('call');
    const history = boundary.networks.history.nodes[2]; vm.openHistoryDetails(history); expect(wrapper.emitted('openHistoryDetailsForm')).toEqual([[history]]);
  });
  it('avoids fetching fresh history and unsupported non-utility token history', async () => {
    boundary.networks.history.timestamp = Date.now(); const { vm } = form(); expect(await vm.loadHistory()).toBe(false); expect(boundary.fetch).not.toHaveBeenCalled();
    boundary.networks.history.timestamp = 0; boundary.route.params.assetId = 'non-utility'; await flushPromises(); await vm.loadHistory(); expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('shows a loader for an empty pending history and clears it on completion', async () => {
    boundary.networks.history.nodes = []; const pending = deferred<void>(); boundary.fetch.mockReturnValueOnce(pending.promise);
    const { wrapper, vm } = form(); await vi.advanceTimersByTimeAsync(300); expect(wrapper.find('loader-stub').exists()).toBe(true);
    pending.resolve(); await flushPromises(); expect(vm.showLoader).toBe(false); expect(wrapper.get('[data-testid="noHistory"]').text()).toBe('assets.noHistory');
  });
  it('contains network failures and clears the loading state', async () => {
    boundary.networks.history.nodes = []; boundary.fetch.mockRejectedValueOnce(new Error('offline'));
    const { vm } = form(); await vi.advanceTimersByTimeAsync(300); await flushPromises(); expect(vm.showLoader).toBe(false);
  });
  it('cancels deferred initial history loading when the view closes', async () => {
    const { wrapper } = form(); wrapper.unmount(); await vi.advanceTimersByTimeAsync(300); expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('reloads history after switching the selected wallet', async () => {
    const { vm } = form(); await vi.advanceTimersByTimeAsync(300); boundary.fetch.mockClear();
    boundary.accounts.selectedWallet = { ...boundary.accounts.selectedWallet, address: 'bob' }; await flushPromises(); expect(boundary.fetch).toHaveBeenCalledOnce(); expect(vm.address).toBe('0:bob');
  });
  it('does not clear a newer loading state when a previous network lookup finishes', async () => {
    boundary.networks.history.nodes = []; const first = deferred<void>(), second = deferred<void>(); boundary.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { vm } = form(); await vi.advanceTimersByTimeAsync(300); boundary.route.params.selectedNetwork = 'ethereum'; await flushPromises();
    first.resolve(); await flushPromises(); expect(vm.showLoader).toBe(true); second.resolve(); await flushPromises(); expect(vm.showLoader).toBe(false);
  });
  it('handles an unavailable network or missing utility asset without crashing', async () => {
    boundary.route.params.selectedNetwork = 'removed'; const { vm } = form(); expect(vm.isMainNetwork).toBe(false); expect(vm.address).toBe(''); await vi.advanceTimersByTimeAsync(300); expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('uses SORA method filters and TON history layout', async () => {
    boundary.route.params.selectedNetwork = SORA_NETWORK_NAME; boundary.accounts.selectedWallet.isTon = true;
    boundary.networks.history.nodes = [{ id: 'reward', method: 'rewarded' }, { id: 'send', method: 'transfer' }];
    const { vm, wrapper } = form(); vm.filterHistoryValueUpdate('reward'); await flushPromises(); expect(vm.filteredHistory.map((item: { id: string }) => item.id)).toEqual(['reward']); expect(vm.historyDropdownOption).toHaveLength(3); expect(wrapper.find('[data-testid="historyFilter"]').exists()).toBe(false);
  });
  it('provides the correct explorer fallback for Solana mainnet and devnet', async () => {
    boundary.route.params.selectedNetwork = 'solana-devnet'; boundary.accounts.balances = []; const { wrapper } = form();
    expect(wrapper.get('[data-testid="solanaExplorerHistory"]').attributes('href')).toBe('https://solscan.io/account/solana-address?cluster=devnet');
    boundary.route.params.selectedNetwork = 'solana'; await flushPromises(); expect(wrapper.get('[data-testid="solanaExplorerHistory"]').attributes('href')).toBe('https://solscan.io/account/solana-address');
    boundary.accounts.selectedWallet.solanaAddress = ''; await flushPromises(); expect(wrapper.find('[data-testid="solanaExplorerHistory"]').exists()).toBe(false);
  });
});

describe('asset network holdings', () => {
  it('filters ready active balances and sorts by balance, popularity or name', async () => {
    const { vm } = form('networks'); expect(vm.sortedNetworks.map((item: { name: string }) => item.name)).toEqual(['ethereum', 'polkadot']);
    vm.filterValueUpdate('popularity'); expect(vm.sortedNetworks[0].name).toBe('ethereum'); vm.filterValueUpdate('name'); expect(vm.sortedNetworks[0].name).toBe('ethereum');
    boundary.accounts.selectedNetwork = FAVORITE_NETWORKS; expect(vm.filteredNetworks.map((item: { name: string }) => item.name)).toEqual(['polkadot']);
    boundary.accounts.selectedNetwork = POPULAR_NETWORKS; expect(vm.filteredNetworks).toHaveLength(2);
    expect(vm.priceString).toBe('$ 2'); expect(vm.getBalanceInNetworkString('polkadot')).toBe('2 DOT'); expect(vm.getFiatInNetworkString('polkadot')).toBe('$ 4'); expect(vm.getBalanceInNetwork('missing')).toBe(0);
  });
  it('shows only funded holdings in My networks and navigates with exact asset/network identity', async () => {
    const { wrapper, vm, currency } = form('networks'); await wrapper.setProps({ currency: { ...currency, balances: [{ name: 'polkadot', transferable: '0', state: APIItemState.READY }, { name: 'ethereum', transferable: '2', state: APIItemState.READY }] } });
    vm.openTab('MyAssets'); expect(vm.filteredNetworks.map((item: { name: string }) => item.name)).toEqual(['ethereum']); vm.openAsset('ethereum'); expect(boundary.push).toHaveBeenCalledWith({ name: Components.AssetHistory, params: { assetId: 'dot', selectedNetwork: 'ethereum' } });
  });
  it('refreshes EVM balances when opening an EVM asset', () => {
    form('networks', { mainNetwork: 'ethereum' }); expect(boundary.fetchEvm).toHaveBeenCalledWith('dot');
  });
  it('tolerates absent balances and balances for removed networks', async () => {
    const { wrapper, vm, currency } = form('networks', { balances: undefined }); vm.openTab('MyAssets'); expect(vm.filteredNetworks).toEqual([]);
    await wrapper.setProps({ currency: { ...currency, balances: [{ name: 'removed', transferable: '1', state: APIItemState.READY }] } }); expect(vm.sortedNetworks).toEqual([]);
    vm.openAsset('removed'); expect(boundary.push).not.toHaveBeenCalled();
  });
});
