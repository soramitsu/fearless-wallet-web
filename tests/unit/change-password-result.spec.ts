import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extensionChangePassword: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  extensionChangePassword: mocks.extensionChangePassword,
  hasMasterPassword: async () => true,
  hasAccounts: async () => true,
  isNeedMigration: async () => false,
  unlockExtension: async () => true,
  initGoogleAuth: vi.fn(),
}));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
  useRoute: () => ({ params: {} }),
}));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', MigrationAccounts: 'MigrationAccounts' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

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
  await wrapper.get('[data-testid="oldPassword"]').setValue('current password');
  await wrapper.get('[data-testid="newPassword"]').setValue('new password');
  await flushPromises();
  return wrapper;
}

const confirm = async (wrapper: VueWrapper) => {
  await wrapper.get('[data-testid="confirm"]').trigger('click');
  await flushPromises();
};

describe('changing the master password', () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({
      title: 'welcome.changePasswordFailed',
      message: '',
      type: 'error',
    });
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
});
