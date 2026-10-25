import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  wallet: { name: 'Fixture wallet', address: 'public-wallet-address', active: true, walletEcosystem: 'substrate' },
  node: { name: 'Private fixture', url: 'http://127.0.0.1:9933' },
  history: { timestamp: 123456, method: 'rewarded', amount: '7', hash: 'public-fixture-hash' },
}));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome' } }));
vi.mock('@/extension/messaging', () => ({ updateCurrentAccount: vi.fn(), upsertNetworkMap: vi.fn() }));
vi.mock('@/screens/main/WalletBalance.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/screens/main/walletTotals', () => ({ fetchWalletTotals: async () => [], walletBalanceCaption: () => '' }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({
  accounts: [fixtures.wallet], selectedWallet: { address: '' }, getAutoSelectNodesValueByNetwork: () => false,
}) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({
  getNetwork: () => ({ name: 'fixture', nodes: [], customNodes: [fixtures.node], currentProvider: fixtures.node.url }),
}) }));
vi.mock('@/stores/staking', () => ({ useStakingStore: () => ({
  getStakingHistory: () => [fixtures.history], getStakingNetwork: () => ({ stashAddress: '', payeeAddress: '' }),
}) }));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: () => '' } }));
vi.mock('@extension-base/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value, setClipboard: vi.fn() }));
vi.mock('@/helpers/history', () => ({ getHistoryValue: vi.fn() }));

import SelectWalletPopup from '@/screens/main/SelectWalletPopup.vue';
import Nodes from '@/screens/accounts/Nodes.vue';
import History from '@/screens/staking/myStake/History.vue';

const stubs = {
  Popup: { template: '<div><slot /></div>' },
  ContentForm: { template: '<div><slot /></div>' },
  FCorners: { template: '<div><slot /></div>' },
  WalletBalance: true, BorderButton: true, ExternalLogo: true, Tooltip: true, Icon: true, Switcher: true, FButton: true,
};
const mocks = { $t: (key: string) => key, $route: { name: 'Nodes', params: { network: 'fixture' } } };

it('opens details for the wallet whose menu was activated, at that menu position', async () => {
  const wrapper = mount(SelectWalletPopup, { global: { stubs, mocks } });
  try {
    await flushPromises();
    const button = wrapper.get<HTMLButtonElement>('[data-testid="dots"]');
    vi.spyOn(button.element, 'getBoundingClientRect').mockReturnValue({ top: 91 } as DOMRect);
    await button.trigger('click');
    expect(wrapper.emitted('toggleWalletDetailsPopupVisible')).toEqual([[undefined, 91, fixtures.wallet.address]]);
  } finally { wrapper.unmount(); }
});

it('preserves both custom-node menu arguments together with the exact node identity', async () => {
  const wrapper = mount(Nodes, {
    global: { mocks, stubs: { ...stubs, NodeItem: {
      props: ['isCustomNode'],
      template: '<button v-if="isCustomNode" @click="$emit(\'openNodeSettingsPopup\', 137, true)">Node menu</button>',
    } } },
  });
  try {
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('openNodeSettingsPopup')).toEqual([['fixture', fixtures.node.name, fixtures.node.url, 137, true]]);
  } finally { wrapper.unmount(); }
});

it('forwards the selected staking history record without render context arguments', async () => {
  const wrapper = mount(History, {
    props: { network: 'fixture', stakingAssetId: 'asset' },
    global: { mocks, stubs: { HistoryItem: {
      props: ['history'],
      template: '<button @click="$emit(\'openHistoryDetailsForm\', history)">Open details</button>',
    } } },
  });
  try {
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('openHistoryDetailsForm')).toEqual([[fixtures.history]]);
  } finally { wrapper.unmount(); }
});
