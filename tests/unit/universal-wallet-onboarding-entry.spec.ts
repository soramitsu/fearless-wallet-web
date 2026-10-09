import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ push: vi.fn(), password: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AddWallet: 'AddWallet', ChangePassword: 'ChangePassword' } }));
vi.mock('@/extension/messaging', () => ({
  hasMasterPassword: mocks.password,
  getUniversalWalletMigrationSnapshot: async () => ({ legacyVaults: [] }),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [] }) }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value }));
import UniversalWalletMigration from '@/screens/addWallet/universalWalletMigration/UniversalWalletMigration.vue';
const mountEntry = () =>
  mount(UniversalWalletMigration, {
    global: {
      stubs: {
        AboveForm: { template: '<main><slot /></main>' },
        FButton: { props: ['text'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{text}}</button>' },
      },
    },
  });
beforeEach(() => vi.clearAllMocks());

describe('first-run Universal Wallet entry', () => {
  it.each(['create', 'import'])('requires password setup before %s and preserves the intent', async (type) => {
    mocks.password.mockResolvedValue(false);
    const wrapper = mountEntry();
    await flushPromises();
    await wrapper.findAll('button')[type === 'create' ? 0 : 1].trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'ChangePassword',
      params: { name: 'AddWallet', type, walletEcosystem: 'substrate' },
    });
    wrapper.unmount();
  });
  it('opens the account flow directly when a password is already configured', async () => {
    mocks.password.mockResolvedValue(true);
    const wrapper = mountEntry();
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'AddWallet',
      params: { type: 'create', walletEcosystem: 'substrate' },
    });
    wrapper.unmount();
  });
});
