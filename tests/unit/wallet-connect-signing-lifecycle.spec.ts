import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import FButton from '@/components/FButton.vue';
import Confirmation from '@/screens/walletConnect/WalletConnectSignConfirmation.vue';

const mocks = vi.hoisted(() => ({
  store: undefined as unknown as { wcRequests: WalletConnectTransactionRequest[] },
  approve: vi.fn(),
  reject: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/extension/messaging', () => ({
  walletConnectRequestApprove: mocks.approve,
  walletConnectRequestReject: mocks.reject,
}));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'WalletConnectSignConfirmation' } } }),
}));
vi.mock('@/router/routes', () => ({
  Components: { Wallet: 'Wallet', WalletConnectSignConfirmation: 'WalletConnectSignConfirmation' },
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/screens/walletConnect/WalletConnectRequestData.vue', () => ({
  default: {
    props: ['request'],
    setup(props) {
      return { initial: JSON.stringify(props.request.params.request.params) };
    },
    template: '<pre>{{ initial }}</pre>',
  },
}));
vi.mock('@/screens/walletConnect/WalletConnectHeader.vue', () => ({
  default: { props: ['title', 'url'], template: '<header>{{ title }} {{ url }}</header>' },
}));
const address = '0x1111111111111111111111111111111111111111';
const request = (approvalId = 'first', value = '0x1234') =>
  ({
    id: 7,
    topic: 'public-topic',
    approvalId,
    params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: [value, address] } },
    verifyContext: { verified: { origin: 'https://' + approvalId + '.example', validation: 'UNKNOWN', verifyUrl: '' } },
  }) as WalletConnectTransactionRequest;
const open = () =>
  mount(Confirmation, {
    attachTo: document.body,
    global: {
      stubs: {
        AboveForm: {
          name: 'AboveForm',
          props: ['showCloseIcon'],
          emits: ['closeHandler'],
          template: '<main><slot /></main>',
        },
        FButton,
        Scroll: { template: '<div><slot /></div>' },
        Hint: true,
      },
    },
  });
const button = (wrapper: ReturnType<typeof open>, action: string) =>
  wrapper.get(`[data-testid="${action}WalletConnectSigning"] button`);
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.approve.mockResolvedValue(true);
  mocks.reject.mockResolvedValue(true);
  mocks.push.mockResolvedValue(undefined);
  mocks.store = reactive({ wcRequests: [request()] });
});

describe('WalletConnect screen owns the displayed approval identity', () => {
  it('handles an empty queue and navigation failure without dereferencing a request', async () => {
    mocks.store.wcRequests = [];
    mocks.push.mockRejectedValueOnce(new Error('navigation unavailable'));
    const wrapper = open();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.findAllComponents(FButton)).toHaveLength(0);
    wrapper.unmount();
  });
  it('uses method positions and the exact internal ID, even for an address-shaped message', async () => {
    mocks.store.wcRequests = [request('first', '0x2222222222222222222222222222222222222222')];
    const wrapper = open();
    await flushPromises();
    expect(document.activeElement).toBe(button(wrapper, 'reject').element);
    await button(wrapper, 'approve').trigger('click');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(address, 'first');
    wrapper.unmount();
  });
  it('updates request details and signer after the next request replaces the first', async () => {
    const wrapper = open();
    await flushPromises();
    const next = request('next', '0xabcd');
    next.params.request.params[1] = '0x2222222222222222222222222222222222222222';
    mocks.store.wcRequests = [next];
    await flushPromises();
    expect(wrapper.get('pre').text()).toContain('0xabcd');
    expect(wrapper.get('header').text()).toContain('next.example');
    await button(wrapper, 'approve').trigger('click');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(next.params.request.params[1], 'next');
    wrapper.unmount();
  });
  it('uses the captured session origin instead of an unverified event origin', async () => {
    const value = request();
    value.context = { session: { origin: 'https://canonical.example' } } as never;
    mocks.store.wcRequests = [value];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.get('header').text()).toContain('https://canonical.example');
    expect(wrapper.get('header').text()).not.toContain('first.example');
    wrapper.unmount();
  });
  it('refuses an old DOM click before the replacement request renders', async () => {
    const wrapper = open();
    await flushPromises();
    const approve = button(wrapper, 'approve').element as HTMLButtonElement;
    mocks.store.wcRequests = [request('replacement')];
    approve.click();
    expect(mocks.approve).not.toHaveBeenCalled();
    await flushPromises();
    wrapper.unmount();
  });
  it('keeps a single pending action and never rejects a replacement after late failure', async () => {
    const waiting = deferred<boolean>();
    mocks.approve.mockReturnValueOnce(waiting.promise);
    const wrapper = open();
    await flushPromises();
    await button(wrapper, 'approve').trigger('click');
    await button(wrapper, 'approve').trigger('click');
    mocks.store.wcRequests = [request('next')];
    await flushPromises();
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
    expect(wrapper.findComponent({ name: 'AboveForm' }).props('showCloseIcon')).toBe(false);
    waiting.reject(new Error('old request failed'));
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await button(wrapper, 'reject').trigger('click');
    await flushPromises();
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith('next');
    wrapper.unmount();
  });
  it.each(['approve', 'reject'])('keeps a failed %s visible and retryable', async (action) => {
    (action === 'approve' ? mocks.approve : mocks.reject).mockRejectedValueOnce(new Error('retry'));
    const wrapper = open();
    await flushPromises();
    await button(wrapper, action).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.store.wcRequests[0].approvalId).toBe('first');
    await button(wrapper, action).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
