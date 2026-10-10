import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ migrate: vi.fn(), list: vi.fn(), forget: vi.fn(), push: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  migrateMasterPassword: mocks.migrate, getMigrationAccounts: mocks.list, forgetAccount: mocks.forget,
  isJsonValid: vi.fn(), jsonRestore: vi.fn(), updateCurrentAccount: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: {} }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn(), push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/helpers', () => ({ cut: (address: string) => address }));

import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import MigrationAccounts from '@/screens/addWallet/keyringMigration/MigrationAccounts.vue';

const global = {
  mocks: { $t: (key: string) => key },
  stubs: {
    AboveForm: { template: '<main><slot /></main>' },
    Scroll: { template: '<div><slot /></div>' },
    FButton: { props: ['text', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{text}}</button>' },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.migrate.mockResolvedValue(true);
  mocks.list.mockResolvedValue([{ address: 'legacy-fixture', name: 'Legacy wallet', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false }]);
});

describe('legacy account upgrade recovery', () => {
  it('retains entered credentials and allows retry after a worker/storage failure', async () => {
    mocks.migrate.mockRejectedValueOnce(new Error('Worker interrupted'));
    const items = [{ address: 'legacy-fixture', password: 'fixture-password', active: true, isComplete: false }];
    const wrapper = shallowMount(BackupWalletsList, { props: { items }, global });
    await wrapper.vm.migrateAccounts(0);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: true, isComplete: false }]);
    expect(items[0].password).toBe('fixture-password');
    await wrapper.vm.migrateAccounts(0);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: false, isComplete: true }]);
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps unmigrated accounts and disables completion until their credentials are upgraded', async () => {
    const wrapper = shallowMount(MigrationAccounts, { global });
    await flushPromises();
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toBe('common.continue');
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(mocks.forget).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  // Parent migrated, its EVM account still on its own 2.6.3 password: the router keeps this screen open for it
  // (legacy-upgrade-navigation.spec.ts), and the row is listed and migrated on its own.
  it('lists and migrates an EVM account whose parent was already migrated', async () => {
    const child = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    mocks.list.mockResolvedValue([
      { address: child, name: '', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true, linkedParentAddress: '5Grw', linkedParentName: 'Polkadot' },
    ]);
    const wrapper = shallowMount(MigrationAccounts, { global });
    await flushPromises();
    const items = wrapper.findComponent(BackupWalletsList).props('items') as Array<{ address: string }>;
    expect(items.map(({ address }) => address)).toEqual([child]);

    const list = shallowMount(BackupWalletsList, { props: { items: [{ ...items[0], password: 'child json password' }] }, global });
    await list.vm.migrateAccounts(0);
    expect(mocks.migrate).toHaveBeenCalledExactlyOnceWith({ address: child, password: 'child json password' });
    expect(list.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: false, isComplete: true }]);
    expect(mocks.forget).not.toHaveBeenCalled();
    list.unmount();
    wrapper.unmount();
  });

  it('offers retry after inventory failure rather than treating the wallet store as empty', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Storage not ready'));
    const wrapper = shallowMount(MigrationAccounts, { global });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.findAll('button').at(-1)?.attributes('disabled')).toBeDefined();
    await wrapper.find('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
