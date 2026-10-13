import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileWalletAuth from '@/screens/mobile-wallet/MobileWalletAuth.vue';
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  subscribe: vi.fn(),
  cancel: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  walletConnectDappInitSession: mocks.init,
  walletConnectDappSubscribeSession: mocks.subscribe,
  walletConnectDappCancelSession: mocks.cancel,
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ back: mocks.back, push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@/screens/addWallet/FinishForm.vue', () => ({
  default: { template: '<section data-testid="finished">Finished</section>' },
}));
vi.mock('@/screens/mobile-wallet/PermissionDeniedPopup.vue', () => ({
  default: { template: '<section data-testid="duplicate">Duplicate</section>' },
}));
let callback: (result: { status?: boolean; message?: string }) => void;
const open = () =>
  mount(MobileWalletAuth, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        Fragment: { template: '<div><slot /></div>' },
        AboveForm: {
          emits: ['closeHandler'],
          template: '<main><button data-testid="close" @click="$emit(\'closeHandler\')">Close</button><slot /></main>',
        },
        QR: { props: ['payload'], template: '<div data-testid="qr">{{ payload }}</div>' },
        Loader: true,
        FButton: { emits: ['click'], template: '<button @click="$emit(\'click\')">Continue</button>' },
      },
    },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.init.mockResolvedValue('wc:public-fixture');
  mocks.cancel.mockResolvedValue(true);
  mocks.subscribe.mockImplementation((_uri, cb) => {
    callback = cb;
    return { response: Promise.resolve({ uri: 'wc:public-fixture' }), unsubscribe: mocks.unsubscribe };
  });
});
describe('mobile pairing screen ownership', () => {
  it('displays its URI and releases the attempt on close', async () => {
    const wrapper = open();
    await flushPromises();
    expect(wrapper.get('[data-testid="qr"]').text()).toBe('wc:public-fixture');
    await wrapper.get('[data-testid="close"]').trigger('click');
    expect(mocks.cancel).toHaveBeenCalledWith(mocks.init.mock.calls[0][0]);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    callback({ status: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="finished"]').exists()).toBe(false);
    wrapper.unmount();
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });
  it('cancels immediately on unmount while initialization is pending', async () => {
    let resolve!: (uri: string) => void;
    mocks.init.mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      })
    );
    const wrapper = open();
    wrapper.unmount();
    expect(mocks.cancel).toHaveBeenCalledWith(mocks.init.mock.calls[0][0]);
    resolve('wc:late-fixture');
    await flushPromises();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('shows success once and ignores a repeated terminal result', async () => {
    const wrapper = open();
    await flushPromises();
    callback({ status: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="finished"]').exists()).toBe(true);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    callback({ status: false, message: 'rejected' });
    await flushPromises();
    expect(mocks.back).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="continueBtn"]').trigger('click');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Wallet' });
    wrapper.unmount();
  });
  it('keeps duplicate feedback visible and releases its subscription', async () => {
    const wrapper = open();
    await flushPromises();
    callback({ status: false, message: 'duplicate' });
    await flushPromises();
    expect(wrapper.find('[data-testid="duplicate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="qr"]').exists()).toBe(false);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it.each(['rejected', 'unavailable'])('reports %s and exits instead of leaving a stale QR', async (message) => {
    const wrapper = open();
    await flushPromises();
    callback({ status: false, message });
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.cancel).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('handles initialization failure without an unhandled promise', async () => {
    mocks.init.mockRejectedValue(new Error('fixture transport failure'));
    const wrapper = open();
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'mobileConnector.connectionFailed' }));
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('waits for the subscription acknowledgement before releasing an early success callback', async () => {
    let acknowledge!: (value: { uri: string }) => void;
    mocks.subscribe.mockImplementation((_uri, cb) => {
      callback = cb;
      return {
        response: new Promise((resolve) => {
          acknowledge = resolve;
        }),
        unsubscribe: mocks.unsubscribe,
      };
    });
    const wrapper = open();
    await flushPromises();
    callback({ status: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="finished"]').exists()).toBe(true);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    acknowledge({ uri: 'wc:public-fixture' });
    await flushPromises();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.back).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});


describe('mobile cancellation storage acknowledgement', () => {
  it('waits for cancellation acknowledgement before leaving the screen', async () => {
    let finish!: (value: boolean) => void;
    mocks.cancel.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const wrapper = open();
    await flushPromises();
    await wrapper.get('[data-testid="close"]').trigger('click');
    expect(mocks.back).not.toHaveBeenCalled();
    callback({ status: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="finished"]').exists()).toBe(false);
    finish(true);
    await flushPromises();
    expect(mocks.back).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('stays open on cancellation failure and allows a close retry', async () => {
    mocks.cancel.mockRejectedValueOnce(new Error('Public storage failure')).mockResolvedValue(true);
    const wrapper = open();
    await flushPromises();
    await wrapper.get('[data-testid="close"]').trigger('click');
    await flushPromises();
    expect(mocks.back).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'mobileConnector.connectionFailed' }));
    expect(wrapper.find('[data-testid="qr"]').exists()).toBe(false);
    await wrapper.get('[data-testid="close"]').trigger('click');
    await flushPromises();
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
    expect(mocks.back).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
