import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ unlock: vi.fn(), push: vi.fn(), query: {} as Record<string, unknown> }));
vi.mock('@/extension/messaging', () => ({ unlockExtension: auth.unlock, windowOpen: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: auth.push }), useRoute: () => ({ query: auth.query }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/screens/welcome/ResetPopup.vue', () => ({ default: { template: '<div data-testid="resetDialog" />' } }));

import Unlock from '@/screens/welcome/Unlock.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import FButton from '@/components/FButton.vue';

function form() {
  return mount(Unlock, { attachTo: document.body, global: {
    components: { ValidatedInput, FButton }, mocks: { $t: (key: string) => key },
    stubs: { Logo: true, Icon: true, CircleButton: true, FCorners: { template: '<div><slot /></div>' } },
  } });
}

beforeEach(() => { vi.resetAllMocks(); auth.query = {}; auth.push.mockResolvedValue(undefined); });

it('does not submit during IME composition or duplicate an in-flight keyboard submission', async () => {
  let finish!: (value: boolean) => void;
  auth.unlock.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const wrapper = form();
  try {
    const input = wrapper.get('input');
    await input.setValue('public-fixture-password');
    await input.trigger('keydown', { key: 'Enter', isComposing: true });
    expect(auth.unlock).not.toHaveBeenCalled();
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(auth.unlock).toHaveBeenCalledOnce();
    expect(wrapper.get('.unlock-btn button').attributes('aria-busy')).toBe('true');
    expect(input.attributes('readonly')).toBeDefined();
    finish(false); await flushPromises();
    expect(wrapper.get('.unlock-btn button').attributes('disabled')).toBeUndefined();
  } finally { if (finish) finish(false); await flushPromises(); wrapper.unmount(); }
});

it('recovers from transport rejection with a generic announced error and permits retry', async () => {
  auth.unlock.mockRejectedValueOnce(new Error('fixture transport failure')).mockResolvedValueOnce(true);
  auth.query = { redirect: '/wallet/public-fixture' };
  const wrapper = form();
  try {
    await wrapper.get('input').setValue('public-fixture-password');
    await wrapper.get('.unlock-btn button').trigger('click'); await flushPromises();
    expect(wrapper.get('.unlock-btn button').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('.unlock-error[role="alert"]').text()).toBe('accountAccess.unlockFailed');
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.text()).not.toContain('fixture transport failure');
    expect(wrapper.text()).not.toContain('public-fixture-password');
    await wrapper.get('.unlock-btn button').trigger('click'); await flushPromises();
    expect(auth.unlock).toHaveBeenCalledTimes(2);
    expect(auth.push).toHaveBeenCalledWith('/wallet/public-fixture');
  } finally { wrapper.unmount(); }
});

it('associates wrong-password feedback with its field and exposes native recovery/support controls', async () => {
  auth.unlock.mockResolvedValue(false);
  const wrapper = form();
  try {
    await wrapper.get('input').setValue('public-wrong-password');
    await wrapper.get('.unlock-btn button').trigger('click'); await flushPromises();
    const error = wrapper.get('[data-testid="errorDescriptions"]');
    expect(error.attributes('role')).toBe('alert');
    expect(error.attributes('aria-live')).toBe('polite');
    expect(wrapper.find('img[src$=".gif"]').exists()).toBe(false);
    expect(error.text()).toBe('common.invalidPassword');
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(error.attributes('id'));
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    await wrapper.get('input').setValue('corrected-fixture-password');
    expect(error.text()).toBe('');
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined();
    await wrapper.get('button[data-testid="forgotPassword"]').trigger('click');
    expect(wrapper.find('[data-testid="resetDialog"]').exists()).toBe(true);
    expect(wrapper.get('a[data-testid="unlockSupport"]').attributes('rel')).toContain('noopener');
  } finally { wrapper.unmount(); }
});

it('does not navigate from a completed unlock after the screen has been left', async () => {
  let finish!: (value: boolean) => void;
  auth.unlock.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const wrapper = form();
  await wrapper.get('input').setValue('public-fixture-password');
  await wrapper.get('.unlock-btn button').trigger('click');
  wrapper.unmount(); finish(true); await flushPromises();
  expect(auth.push).not.toHaveBeenCalled();
});
