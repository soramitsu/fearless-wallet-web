import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extensionChangePassword: vi.fn(),
  hasMasterPassword: vi.fn(),
  getAccessStatus: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  unlock: vi.fn(),
  hasAccounts: vi.fn(),
  initGoogleAuth: vi.fn(),
  params: {} as Record<string, string>,
}));
vi.mock('@/extension/messaging', () => ({
  extensionChangePassword: mocks.extensionChangePassword,
  hasMasterPassword: mocks.hasMasterPassword,
  getAccessStatus: mocks.getAccessStatus,
  hasAccounts: mocks.hasAccounts,
  isNeedMigration: async () => false,
  unlockExtension: mocks.unlock,
  initGoogleAuth: mocks.initGoogleAuth,
}));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
  useRoute: () => ({ params: mocks.params }),
}));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', MigrationAccounts: 'MigrationAccounts' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, tc: (key: string, count: number) => `${key}:${count}` }),
}));

import ChangePassword from '@/screens/welcome/ChangePassword.vue';

async function openWithPasswords(): Promise<VueWrapper> {
  const wrapper = mount(ChangePassword, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AboveForm: { template: '<section><slot /></section>' },
        Scroll: { template: '<div><slot /></div>' },
        ValidatedInput: {
          emits: ['change'],
          template: '<input data-testid="oldPassword" @input="$emit(\'change\', $event.target.value)" />',
        },
        PasswordForm: {
          emits: ['setPassword'],
          template: '<input data-testid="newPassword" @input="$emit(\'setPassword\', $event.target.value)" />',
        },
        FButton: {
          props: ['disabled', 'text'],
          emits: ['click'],
          template:
            '<button type="button" data-testid="confirm" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
        },
      },
    },
  });
  await flushPromises();
  // A wallet without a master password is asked for the new one only.
  if (wrapper.find('[data-testid="oldPassword"]').exists()) {
    await wrapper.get('[data-testid="oldPassword"]').setValue('current password');
  }
  await wrapper.get('[data-testid="newPassword"]').setValue('new password');
  await flushPromises();
  return wrapper;
}

const confirm = async (wrapper: VueWrapper) => {
  await wrapper.get('[data-testid="confirm"]').trigger('click');
  await flushPromises();
};

describe('changing the master password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasMasterPassword.mockResolvedValue(true);
    mocks.hasAccounts.mockResolvedValue(true);
    mocks.initGoogleAuth.mockResolvedValue(undefined);
    mocks.params = {};
    mocks.unlock.mockResolvedValue(true);
    mocks.getAccessStatus.mockResolvedValue({ issues: [] });
  });

  it.each([
    ['answers false', () => mocks.extensionChangePassword.mockResolvedValue(false)],
    ['fails', () => mocks.extensionChangePassword.mockRejectedValue(new Error('Could not establish connection'))],
  ])('stays on the screen with an error when the background %s', async (_, arrange) => {
    arrange();
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect(mocks.extensionChangePassword).toHaveBeenCalledExactlyOnceWith({
      oldPassword: 'current password',
      newPassword: 'new password',
    });
    expect(wrapper.get('[data-testid="passwordChangeFailed"]').text()).toBe('welcome.changePasswordFailed');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
    // The user can correct the old password and try again.
    expect((wrapper.get('[data-testid="confirm"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('confirms and returns to the wallet only after the change succeeded', async () => {
    mocks.extensionChangePassword.mockResolvedValue(true);
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({
      title: 'welcome.successfulChangePassword',
      message: '',
      type: 'success',
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
  });

  // 3.0.5 left TON phrases under the old password on every change. Such an account stays as it is and is listed.
  it('says how many accounts still wait for an earlier password after a successful change', async () => {
    mocks.extensionChangePassword.mockResolvedValue(true);
    mocks.getAccessStatus.mockResolvedValue({
      issues: [
        { address: 'UQ-ton', kind: 'previous_master_password' },
        { address: '5Grw', kind: 'previous_master_password' },
        { address: '0x1', kind: 'legacy_account_password' },
      ],
    });
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect(mocks.notify.mock.calls).toEqual([
      [{ title: 'welcome.successfulChangePassword', message: '', type: 'success' }],
      [{ title: 'accountAccess.changePasswordPending:2', message: '', type: 'info' }],
    ]);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
  });

  // A second press after the change would check the old password again, fail and say nothing was changed.
  it('keeps Confirm disabled after a successful change until the screen is left', async () => {
    let answerStatus: (status: { issues: never[] }) => void = () => undefined;
    mocks.extensionChangePassword.mockResolvedValue(true);
    mocks.getAccessStatus.mockReturnValue(new Promise((resolve) => (answerStatus = resolve)));
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect((wrapper.get('[data-testid="confirm"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-testid="confirm"]').trigger('click');
    expect(mocks.extensionChangePassword).toHaveBeenCalledOnce();

    answerStatus({ issues: [] });
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
  });

  it('still returns to the wallet when the list of waiting accounts cannot be read', async () => {
    mocks.extensionChangePassword.mockResolvedValue(true);
    mocks.getAccessStatus.mockRejectedValue(new Error('Could not establish connection'));
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'success' }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
  });

  it('does not notify or navigate after the password response arrives on an unmounted screen', async () => {
    let answer!: (value: boolean) => void;
    mocks.extensionChangePassword.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const wrapper = await openWithPasswords();
    await confirm(wrapper);
    wrapper.unmount();
    answer(true);
    await flushPromises();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('admits only one pending confirmation even before the disabled DOM refreshes', async () => {
    let answer!: (value: boolean) => void;
    mocks.extensionChangePassword.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const wrapper = await openWithPasswords();
    const button = wrapper.get('[data-testid="confirm"]').element;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.extensionChangePassword).toHaveBeenCalledOnce();
    answer(false);
    await flushPromises();
    wrapper.unmount();
  });

  it('ignores obsolete old-password validation after a newer value failed', async () => {
    const wrapper = await openWithPasswords();
    let answer!: (value: boolean) => void;
    mocks.unlock.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; })).mockResolvedValueOnce(false);
    await wrapper.get('[data-testid="oldPassword"]').setValue('earlier valid password');
    await wrapper.get('[data-testid="oldPassword"]').setValue('newer invalid password');
    await flushPromises();
    answer(true);
    await flushPromises();
    expect(wrapper.get('[data-testid="confirm"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps confirmation disabled until status loads, then permits retry after a read failure', async () => {
    mocks.hasMasterPassword.mockRejectedValueOnce(new Error('private storage detail'));
    const wrapper = await openWithPasswords();
    expect(wrapper.get('[data-testid="passwordLoadFailed"]').text()).toContain('migration.loadFailed');
    expect(wrapper.text()).not.toContain('private storage detail');
    expect(wrapper.findAll('[data-testid="confirm"]').at(-1)!.attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="passwordLoadFailed"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="passwordLoadFailed"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="oldPassword"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not navigate after leaving during the post-change account scan', async () => {
    let answer!: (value: { issues: never[] }) => void;
    mocks.extensionChangePassword.mockResolvedValue(true);
    mocks.getAccessStatus.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const wrapper = await openWithPasswords();
    await confirm(wrapper);
    wrapper.unmount();
    answer({ issues: [] });
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('retries Google continuation without creating the already-saved password again', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    mocks.hasAccounts.mockResolvedValue(false);
    mocks.params = { name: 'GoogleAuth' };
    mocks.extensionChangePassword.mockResolvedValue(true);
    const wrapper = await openWithPasswords();
    await confirm(wrapper);
    expect(mocks.initGoogleAuth).toHaveBeenCalledOnce();
    expect((wrapper.get('[data-testid="confirm"]').element as HTMLButtonElement).disabled).toBe(false);
    await confirm(wrapper);
    expect(mocks.initGoogleAuth).toHaveBeenCalledTimes(2);
    expect(mocks.extensionChangePassword).toHaveBeenCalledOnce();
  });

  it('handles Google continuation failure without exposing its detail or repeating password setup', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    mocks.hasAccounts.mockResolvedValue(false);
    mocks.params = { name: 'GoogleAuth' };
    mocks.extensionChangePassword.mockResolvedValue(true);
    mocks.initGoogleAuth.mockRejectedValueOnce(new Error('Public fixture private OAuth detail'));
    const wrapper = await openWithPasswords();
    await confirm(wrapper);
    expect(wrapper.get('[data-testid="passwordContinuationFailed"]').text()).toBe('mobileConnector.connectionFailed');
    expect(wrapper.text()).not.toContain('private OAuth');
    expect((wrapper.get('[data-testid="confirm"]').element as HTMLButtonElement).disabled).toBe(false);
    await confirm(wrapper);
    expect(mocks.extensionChangePassword).toHaveBeenCalledOnce();
  });

  it('keeps password failure instructions available on the screen', async () => {
    mocks.extensionChangePassword.mockResolvedValue(false);
    const wrapper = await openWithPasswords();
    await confirm(wrapper);
    expect(wrapper.get('[data-testid="passwordChangeFailed"]').attributes('role')).toBe('alert');
    expect(wrapper.get('[data-testid="passwordChangeFailed"]').text()).toBe('welcome.changePasswordFailed');
  });

  it('does not mention a current password when the first master password could not be saved', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    mocks.extensionChangePassword.mockResolvedValue(false);
    const wrapper = await openWithPasswords();

    await confirm(wrapper);

    expect(mocks.extensionChangePassword).toHaveBeenCalledExactlyOnceWith({ oldPassword: '', newPassword: 'new password' });
    expect(wrapper.get('[data-testid="passwordChangeFailed"]').text()).toBe('welcome.createPasswordFailed');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
