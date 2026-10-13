import { flushPromises, mount } from '@vue/test-utils';
import { reactive, type Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkJson } from '@extension-base/types';
type Accounts = { selectedWallet: { address: string; hasEthereum: boolean }; selectedNetwork: string; accounts: unknown[] };
type Controls = { openNotificationPopup(): void; selectedNodeUrl: string; toggleFavorite(network: string): Promise<void> };

const io = vi.hoisted(() => ({ save: vi.fn(), favorite: vi.fn(), notify: vi.fn(), networks: {} as Record<string, NetworkJson>, accounts: {} as Accounts }));
vi.mock('@/extension/messaging', () => ({ upsertNetworkMap: io.save }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: (name: string) => io.networks[name],
  get networks() { return Object.values(io.networks); }, toggleFavoriteNetwork: io.favorite }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => io.accounts }));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: () => '', isEthereumNetwork: () => false } }));
vi.mock('@extension-base/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value, setClipboard: vi.fn() }));
vi.mock('@/screens/accounts/ExportForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/accounts/ExportTypeForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/accounts/AccountSettingsPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/accounts/AddEthereumAccountPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/router/routes', () => ({ Components: { Nodes: 'Nodes' } }));

import Nodes from '@/screens/accounts/Nodes.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';

const route = reactive({ name: 'Nodes', params: { network: 'Polkadot' } });
const wrappers: ReturnType<typeof mount>[] = [];
const stubs = {
  AboveForm: { template: '<div><slot /></div>' }, ContentForm: { template: '<div><slot /></div>' },
  Scroll: { template: '<div><slot /></div>' }, ExternalLogo: true, Icon: true, Tooltip: true, FButton: true,
  Switcher: { props: ['disabled', 'value'], template: '<button data-testid="auto" :disabled="disabled" :aria-checked="value" @click="$emit(\'change\', !value)">Auto</button>' },
  NodeItem: { props: ['url', 'isActive'], template: '<button class="node" :data-url="url" :aria-pressed="isActive" @click="$emit(\'changeNode\')">Node</button>' },
  RouterView: true, NetworkItem: true, SearchInput: true, Tabs: true,
  NotificationPopup: { props: ['acceptDisabled', 'headers'], template: '<section data-testid="delete-dialog"><p>{{headers.text}}</p><button :disabled="acceptDisabled" @click="$emit(\'handlerAccept\')">Delete</button><button @click="$emit(\'handlerClose\')">Cancel</button></section>' },
};
function open(component: Component) {
  const wrapper = mount(component, { global: { stubs, mocks: { $t: (key: string) => key, $notify: io.notify,
    $route: route, $router: { push: vi.fn(), back: vi.fn() } } } });
  wrappers.push(wrapper);
  return wrapper;
}
function deferred() {
  let resolve!: () => void; let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function deletion(wrapper: ReturnType<typeof mount>, url = 'wss://personal.invalid') {
  await wrapper.setData({ selectedNetwork: 'Polkadot', selectedNodeName: 'Personal', selectedNodeUrl: url });
  (wrapper.vm as unknown as Controls).openNotificationPopup(); await flushPromises();
  await wrapper.get('[data-testid="delete-dialog"] button').trigger('click');
}
describe('acknowledged network controls', () => {
  beforeEach(() => {
    vi.resetAllMocks(); route.params.network = 'Polkadot';
    io.networks = reactive(Object.fromEntries(['Polkadot', 'Kusama'].map((name) => [name, { name, chainId: name,
      nodes: [{ name: 'Public', url: 'wss://public.invalid' }], customNodes: [{ name: 'Personal', url: 'wss://personal.invalid' }],
      currentProvider: 'wss://personal.invalid', isManual: true, favorite: [] }])) as Record<string, NetworkJson>);
    io.accounts = reactive({ selectedWallet: { address: 'owner-a', hasEthereum: true }, selectedNetwork: 'all', accounts: [] });
  });
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); });

  it('turns automatic selection on only after the worker commits the actual provider choice', async () => {
    const held = deferred(); io.save.mockReturnValue(held.promise);
    const wrapper = open(Nodes);
    await wrapper.get('[data-testid="auto"]').trigger('click');
    expect(io.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'Polkadot', isManual: false, currentProvider: 'wss://public.invalid' }), io.networks.Polkadot);
    expect(wrapper.get('[data-testid="auto"]').attributes('aria-checked')).toBe('false');
    expect(wrapper.get('[data-testid="auto"]').attributes('disabled')).toBeDefined();
    Object.assign(io.networks.Polkadot, io.save.mock.calls[0][0]); held.resolve(); await flushPromises();
    expect(wrapper.get('[data-testid="auto"]').attributes('aria-checked')).toBe('true');
  });

  it('retains the current node after failed selection and permits retry', async () => {
    io.save.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined);
    const wrapper = open(Nodes);
    await wrapper.get('[data-url="wss://public.invalid"]').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('addWallet.google.somethingWrong');
    expect(io.networks.Polkadot.currentProvider).toBe('wss://personal.invalid');
    await wrapper.get('[data-url="wss://public.invalid"]').trigger('click'); await flushPromises();
    expect(io.save).toHaveBeenCalledTimes(2);
  });

  it('does not put a previous network failure on a reused route', async () => {
    const held = deferred(); io.save.mockReturnValue(held.promise);
    const wrapper = open(Nodes);
    await wrapper.get('[data-testid="auto"]').trigger('click');
    route.params.network = 'Kusama'; held.reject(new Error('disk full')); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('keeps deletion open until acknowledgement and commits active-node fallback atomically', async () => {
    const held = deferred(); io.save.mockReturnValue(held.promise);
    const wrapper = open(AccountsLayout); await deletion(wrapper);
    expect(io.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ customNodes: [], currentProvider: 'wss://public.invalid', isManual: false }), io.networks.Polkadot);
    expect(wrapper.find('[data-testid="delete-dialog"]').exists()).toBe(true);
    expect(io.networks.Polkadot.customNodes).toHaveLength(1);
    await wrapper.get('[data-testid="delete-dialog"] button').trigger('click'); expect(io.save).toHaveBeenCalledOnce();
    held.resolve(); await flushPromises(); expect(wrapper.find('[data-testid="delete-dialog"]').exists()).toBe(false);
  });

  it('shows failed deletion and lets the same dialog retry', async () => {
    io.save.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined);
    const wrapper = open(AccountsLayout); await deletion(wrapper); await flushPromises();
    expect(wrapper.get('[data-testid="delete-dialog"]').text()).toContain('addWallet.google.somethingWrong');
    await wrapper.get('[data-testid="delete-dialog"] button').trigger('click'); await flushPromises();
    expect(io.save).toHaveBeenCalledTimes(2); expect(wrapper.find('[data-testid="delete-dialog"]').exists()).toBe(false);
  });

  it('does not dismiss a new deletion dialog when a cancelled request completes', async () => {
    const held = deferred(); io.save.mockReturnValue(held.promise);
    const wrapper = open(AccountsLayout); await deletion(wrapper);
    await wrapper.get('[data-testid="delete-dialog"] button:last-child').trigger('click');
    await wrapper.setData({ selectedNodeName: 'Later', selectedNodeUrl: 'wss://later.invalid' });
    (wrapper.vm as unknown as Controls).openNotificationPopup(); await flushPromises();
    held.resolve(); await flushPromises();
    expect(wrapper.find('[data-testid="delete-dialog"]').exists()).toBe(true);
    expect((wrapper.vm as unknown as Controls).selectedNodeUrl).toBe('wss://later.invalid');
  });

  it('waits for favorite acknowledgement, rejects duplicate activation and captures its wallet', async () => {
    const held = deferred(); io.favorite.mockReturnValue(held.promise);
    const wrapper = open(NetworkManagement);
    const pending = (wrapper.vm as unknown as Controls).toggleFavorite('Polkadot');
    await (wrapper.vm as unknown as Controls).toggleFavorite('Polkadot');
    expect(io.favorite).toHaveBeenCalledExactlyOnceWith({ networkName: 'Polkadot', address: 'owner-a' });
    expect(io.notify).not.toHaveBeenCalled();
    held.resolve(); await pending; expect(io.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'success' }));
  });

  it('reports favorite failure and supports retry', async () => {
    io.favorite.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(false);
    const wrapper = open(NetworkManagement);
    await (wrapper.vm as unknown as Controls).toggleFavorite('Polkadot');
    expect(io.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'error' }));
    await (wrapper.vm as unknown as Controls).toggleFavorite('Polkadot');
    expect(io.favorite).toHaveBeenCalledTimes(2);
  });

  it.each(['wallet', 'unmount'])('does not announce favorite success after %s departure', async (departure) => {
    const held = deferred(); io.favorite.mockReturnValue(held.promise);
    const wrapper = open(NetworkManagement);
    const pending = (wrapper.vm as unknown as Controls).toggleFavorite('Polkadot');
    expect(io.favorite).toHaveBeenCalledOnce();
    if (departure === 'wallet') io.accounts.selectedWallet.address = 'owner-b'; else wrapper.unmount();
    held.resolve(); await pending; expect(io.notify).not.toHaveBeenCalled();
  });
});
