import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ changePassword: vi.fn(), reset: vi.fn(), push: vi.fn(), notify: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  extensionChangePassword: mocks.changePassword, resetWallet: mocks.reset,
  getMigrationAccounts: vi.fn().mockResolvedValue([]), getAccessStatus: vi.fn().mockResolvedValue({ issues: [] }),
  hasMasterPassword: vi.fn().mockResolvedValue(true), hasAccounts: vi.fn().mockResolvedValue(true),
  isNeedMigration: vi.fn().mockResolvedValue(false), unlockExtension: vi.fn().mockResolvedValue(true), initGoogleAuth: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }), useRoute: () => ({ params: {} }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Welcome: 'Welcome' } }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import ChangePassword from '@/screens/welcome/ChangePassword.vue';
import ResetWallet from '@/screens/welcome/ResetWallet.vue';

const global = {
  mocks: { $t: (key: string) => key },
  stubs: {
    AboveForm: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' },
    FButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
    ValidatedInput: true, PasswordForm: true, FInput: true, Icon: true,
  },
};
beforeEach(() => { vi.clearAllMocks(); mocks.changePassword.mockReset(); mocks.reset.mockReset(); });

describe('wallet password and reset commit acknowledgements', () => {
  it.each(['false', 'rejection'])('keeps password form open on %s and permits retry', async (failure) => {
    if (failure === 'false') mocks.changePassword.mockResolvedValueOnce(false);
    else mocks.changePassword.mockRejectedValueOnce(new Error('Storage unavailable'));
    mocks.changePassword.mockResolvedValueOnce(true);
    const wrapper = shallowMount(ChangePassword, { global });
    await flushPromises();
    wrapper.findComponent({ name: 'ValidatedInput' }).vm.$emit('change', 'old-test-password');
    wrapper.findComponent({ name: 'PasswordForm' }).vm.$emit('setPassword', 'new-test-password');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('welcome.changePasswordFailed');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it.each(['false', 'rejection'])('keeps reset form open on %s and permits retry', async (failure) => {
    if (failure === 'false') mocks.reset.mockResolvedValueOnce(false);
    else mocks.reset.mockRejectedValueOnce(new Error('Storage unavailable'));
    mocks.reset.mockResolvedValueOnce(true);
    const wrapper = shallowMount(ResetWallet, { global });
    await flushPromises();
    wrapper.findComponent({ name: 'FInput' }).vm.$emit('change', 'Reset wallet');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('welcome.resetFailed');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Welcome' });
    wrapper.unmount();
  });

  it('waits for the durable reset result before navigation and prevents duplicate submissions', async () => {
    let resolve!: (result: boolean) => void;
    mocks.reset.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const wrapper = shallowMount(ResetWallet, { global });
    await flushPromises();
    wrapper.findComponent({ name: 'FInput' }).vm.$emit('change', 'Reset wallet');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    resolve(true);
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Welcome' });
    wrapper.unmount();
  });
});
