import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ push: vi.fn(), password: vi.fn(), snapshot: vi.fn(), select: vi.fn(), records: vi.fn() }));
vi.mock('@/consts/global', async original => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: false }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AddWallet: 'AddWallet', ChangePassword: 'ChangePassword', StorageRecovery: 'StorageRecovery' } }));
vi.mock('@/extension/messaging', () => ({
  hasMasterPassword: mocks.password,
  getRecoveryRecords: mocks.records,
  getUniversalWalletMigrationSnapshot: mocks.snapshot,
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], setSelectedWallet: mocks.select }) }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value }));
import FButton from '@/components/FButton.vue';
import UniversalWalletMigration from '@/screens/addWallet/universalWalletMigration/UniversalWalletMigration.vue';
const mountEntry = () =>
  mount(UniversalWalletMigration, {
    global: {
      components: { FButton },
      stubs: {
        Icon: true,
        AboveForm: { template: '<main><slot /></main>' },
      },
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.snapshot.mockResolvedValue({ legacyVaults: [] });
  mocks.records.mockResolvedValue([]);
  mocks.push.mockResolvedValue(undefined);
});

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

describe('migration entry pending and failure states', () => {
  it('does not show an empty-wallet claim or open a flow before the account snapshot resolves', async () => {
    let finish!: (value: unknown) => void;
    mocks.snapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mountEntry();
    expect(wrapper.text()).not.toContain('migration.universalWalletEmptyText');
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes('disabled')).toBeDefined();
      button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mocks.password).not.toHaveBeenCalled();
    finish({ legacyVaults: [] });
    await flushPromises();
    expect(wrapper.text()).toContain('migration.universalWalletEmptyText');
    wrapper.unmount();
  });

  it('offers a retry after a failed snapshot without inventing an empty wallet', async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error('private backend detail'));
    const wrapper = mountEntry();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('migration.loadFailed');
    expect(wrapper.text()).not.toContain('private backend detail');
    expect(wrapper.text()).not.toContain('migration.universalWalletEmptyText');
    await wrapper.get('[data-testid="migrationLoadFailed"] button').trigger('click');
    await flushPromises();
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('holds one opening intent across repeated create/import clicks and restores retry after rejection', async () => {
    let fail!: (value: Error) => void;
    mocks.password.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        })
    );
    const wrapper = mountEntry();
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    for (const button of wrapper.findAll('button'))
      button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.password).toHaveBeenCalledOnce();
    expect(wrapper.findAll('button')[0].attributes('aria-busy')).toBe('true');
    fail(new Error('transport detail'));
    await flushPromises();
    expect(wrapper.get('[data-testid="migrationOpenFailed"]').text()).toBe('migration.loadFailed');
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.password.mockResolvedValue(true);
    await wrapper.findAll('button')[1].trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AddWallet',
      params: { type: 'import', walletEcosystem: 'substrate' },
    });
    wrapper.unmount();
  });

  it('does not navigate when the password lookup resolves after leaving the screen', async () => {
    let finish!: (value: boolean) => void;
    mocks.password.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mountEntry();
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    wrapper.unmount();
    finish(true);
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps unavailable legacy export focusable with its reason and cannot select an account', async () => {
    mocks.snapshot.mockResolvedValue({
      legacyVaults: [
        {
          vaultId: 'public-fixture',
          displayName: 'Retained wallet',
          address: 'fixture-address',
          ecosystem: 'substrate',
          mode: 'export-only',
          canExportSecrets: false,
          canSignTransactions: false,
        },
      ],
    });
    const wrapper = mountEntry();
    await flushPromises();
    const button = wrapper.get('.universal-migration__vault-export button');
    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-disabled')).toBe('true');
    const reason = wrapper.get('.button-disabled-reason');
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'));
    expect(reason.text()).toBe('migration.exportLegacyVaultUnavailable');
    await button.trigger('click');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});


describe('retained recovery at the empty-wallet entry', () => {
  it.each([false, true])('opens recovery even when migration snapshot failure is %s', async (failed) => {
    mocks.records.mockResolvedValue([{ key: 'fw:account:public-unloaded', kind: 'account' }]);
    if (failed) mocks.snapshot.mockRejectedValue(new Error('snapshot unavailable'));
    const wrapper = mountEntry();
    await flushPromises();
    await wrapper.get('[data-testid="recoveryDataLink"] button').trigger('click');
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'StorageRecovery' });
    expect(mocks.password).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not offer an empty retained inventory', async () => {
    const wrapper = mountEntry();
    await flushPromises();
    expect(wrapper.find('[data-testid="recoveryDataLink"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
