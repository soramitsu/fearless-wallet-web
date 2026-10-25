import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import FButton from '@/components/FButton.vue';
import Checkbox from '@/components/Checkbox.vue';
import Transaction from '@/screens/extension-ui/signing/Transaction.vue';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';

type Fixture = {
  signAllRequests: { substrate: never[]; evm: Record<string, EvmRequestPayload>; solana: Record<string, never> };
  approveSign: ReturnType<typeof vi.fn>;
  signCancel: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  push: vi.fn(),
  deny: vi.fn(),
  notify: vi.fn(),
  store: undefined as unknown as Fixture,
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [] }) }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'Transaction' } } }),
}));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Transaction: 'Transaction' } }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.deny }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string, params?: unknown) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
}));
const address = '0x1111111111111111111111111111111111111111';
const request = (id = 'first', message = '0xff'): EvmRequestPayload => ({
  id,
  url: `https://${id}.example`,
  method: 'personal_sign',
  data: [message, address],
  account: { address, name: 'Public account', isMobile: false },
  network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
});
const setRequest = (entry?: EvmRequestPayload) => {
  mocks.store.signAllRequests.evm = entry ? { [entry.id]: entry } : {};
};
const open = () =>
  mount(Transaction, {
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
        Checkbox,
        Icon: true,
      },
    },
  });
const button = (wrapper: ReturnType<typeof open>, action: 'approve' | 'reject') =>
  wrapper.get(`[data-testid="${action}Signing"] button`);
async function consent(wrapper: ReturnType<typeof open>) {
  const details = wrapper.get('details');
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger('toggle');
  await wrapper.get('input[type="checkbox"]').setValue(true);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
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
  mocks.deny.mockResolvedValue(false);
  mocks.store = reactive({
    signAllRequests: { substrate: [] as never[], evm: { first: request() }, solana: {} },
    approveSign: mocks.approve,
    signCancel: mocks.reject,
  });
});

describe('signing review owns consent and rendered request', () => {
  it('handles an empty queue and navigation errors without a missing-account dereference', async () => {
    setRequest();
    mocks.push.mockRejectedValueOnce(new Error('route unavailable'));
    const wrapper = open();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="approveSigning"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('requires both raw expansion and explicit risk consent for blind requests', async () => {
    const wrapper = open();
    await flushPromises();
    expect(document.activeElement).toBe(button(wrapper, 'reject').element);
    expect(wrapper.findAllComponents(FButton).map((entry) => entry.props('type'))).toEqual(['primary', 'secondary']);
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
    await button(wrapper, 'approve').trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
    await consent(wrapper);
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBeUndefined();
    await button(wrapper, 'approve').trigger('click');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', kind: 'evm' });
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'signingReview.signed {"origin":"https://first.example"}', type: 'info' })
    );
    wrapper.unmount();
  });
  it('disables blind approval again if raw review closes', async () => {
    const wrapper = open();
    await flushPromises();
    await consent(wrapper);
    const details = wrapper.get('details');
    (details.element as HTMLDetailsElement).open = false;
    await details.trigger('toggle');
    await button(wrapper, 'approve').trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('never auto-approves mobile accounts', async () => {
    const entry = request('mobile', '0x6869');
    entry.account.isMobile = true;
    setRequest(entry);
    const wait = deferred<boolean>();
    mocks.approve.mockReturnValueOnce(wait.promise);
    const wrapper = open();
    await flushPromises();
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button(wrapper, 'reject').element);
    expect(wrapper.findAllComponents(FButton).map((entry) => entry.props('type'))).toEqual(['secondary', 'primary']);
    await button(wrapper, 'approve').trigger('click');
    expect(wrapper.text()).toContain('mobileConnector.signMobile');
    wait.resolve(true);
    await flushPromises();
    wrapper.unmount();
  });
  it.each(['new ID', 'changed bytes', 'changed network', 'changed account'])(
    'clears consent and refuses the old rendered approval after %s',
    async (change) => {
      const wrapper = open();
      await flushPromises();
      await consent(wrapper);
      const oldControl = wrapper.findAllComponents(FButton)[1];
      const next = request(change === 'new ID' ? 'second' : 'first', change === 'changed bytes' ? '0xffff' : '0xff');
      if (change === 'changed network') next.network = { ...next.network, name: 'Other chain', chainId: '2' };
      if (change === 'changed account')
        next.account = { ...next.account, address: '0x2222222222222222222222222222222222222222' };
      setRequest(next);
      oldControl.vm.$emit('click');
      expect(mocks.approve).not.toHaveBeenCalled();
      await flushPromises();
      expect((wrapper.get('details').element as HTMLDetailsElement).open).toBe(false);
      expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false);
      expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
      await consent(wrapper);
      await button(wrapper, 'approve').trigger('click');
      await flushPromises();
      expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: next.id, kind: 'evm' });
      wrapper.unmount();
    }
  );
  it('has no signing action for phishing and ignores a late clean result from the previous requester', async () => {
    const oldCheck = deferred<boolean>();
    mocks.deny.mockReturnValueOnce(oldCheck.promise).mockResolvedValueOnce(true);
    const wrapper = open();
    await flushPromises();
    await consent(wrapper);
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
    setRequest(request('second'));
    await flushPromises();
    oldCheck.resolve(false);
    await flushPromises();
    expect(wrapper.text()).toContain('signingReview.flagged');
    expect(wrapper.find('[data-testid="approveSigning"]').exists()).toBe(false);
    expect(button(wrapper, 'reject').text()).toBe('common.close');
    await button(wrapper, 'reject').trigger('click');
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith({ id: 'second', kind: 'evm' });
    expect(mocks.approve).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('treats a failed phishing lookup as unverified, never trusted', async () => {
    mocks.deny.mockRejectedValueOnce(new Error('offline'));
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('portfolioPage.unverified');
    expect(button(wrapper, 'approve').attributes('aria-disabled')).toBe('true');
    wrapper.unmount();
  });
  it('does not permit an invalid payload through blind acknowledgment', async () => {
    setRequest(request('invalid', '0x1'));
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('signingReview.invalidRequest');
    expect(wrapper.find('[data-testid="approveSigning"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('prevents duplicate approval, rejection, and close while approval is pending', async () => {
    setRequest(request('first', '0x6869'));
    const wait = deferred<boolean>();
    mocks.approve.mockReturnValueOnce(wait.promise);
    const wrapper = open();
    await flushPromises();
    await button(wrapper, 'approve').trigger('click');
    await button(wrapper, 'approve').trigger('click');
    await button(wrapper, 'reject').trigger('click');
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('closeHandler');
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(wrapper.getComponent({ name: 'AboveForm' }).props('showCloseIcon')).toBe(false);
    wait.resolve(true);
    await flushPromises();
    wrapper.unmount();
  });
  it('does not report a false signing result as success even after navigation', async () => {
    setRequest(request('first', '0x6869'));
    const wait = deferred<boolean>();
    mocks.approve.mockReturnValueOnce(wait.promise);
    const wrapper = open();
    await flushPromises();
    await button(wrapper, 'approve').trigger('click');
    wrapper.unmount();
    wait.resolve(false);
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'error' }));
  });
  it('keeps retries on the same request and does not display old failures on a replacement', async () => {
    setRequest(request('first', '0x6869'));
    mocks.approve.mockRejectedValueOnce(new Error('worker unavailable'));
    const wrapper = open();
    await flushPromises();
    await button(wrapper, 'approve').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    const wait = deferred<boolean>();
    mocks.approve.mockReturnValueOnce(wait.promise);
    await button(wrapper, 'approve').trigger('click');
    setRequest(request('second', '0x6869'));
    wait.reject(new Error('old failure'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('copies the full displayed account and exposes a clipboard failure', async () => {
    const copy = vi.fn().mockRejectedValueOnce(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const wrapper = mount(WalletInfo, {
      props: { address, name: 'Full public account' },
      global: { stubs: { Icon: true } },
    });
    expect(wrapper.text()).toContain(address);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(copy).toHaveBeenCalledExactlyOnceWith(address);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
