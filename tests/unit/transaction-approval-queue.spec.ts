import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import FButton from '@/components/FButton.vue';
import Checkbox from '@/components/Checkbox.vue';

const mocks = vi.hoisted(() => ({
  approveSign: vi.fn(),
  deny: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  store: {} as Record<string, unknown>,
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [] }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'Transaction' } } }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Transaction: 'Transaction' } }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.deny }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import Transaction from '@/screens/extension-ui/signing/Transaction.vue';

const address = '0x1111111111111111111111111111111111111111';
const request = (id: string, isMobile = false): EvmRequestPayload => ({
  id, url: `https://${id}.example`, method: 'personal_sign', data: ['0xff', address],
  account: { address, name: 'Wallet', isMobile },
  network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
});
const setRequests = (...requests: EvmRequestPayload[]) => {
  mocks.store.signAllRequests = { substrate: [], evm: Object.fromEntries(requests.map((entry) => [entry.id, entry])), solana: {} };
};
function open() {
  return mount(Transaction, { attachTo: document.body, global: { stubs: {
    AboveForm: { template: '<main><slot /></main>' }, FButton, Checkbox, Icon: true,
  } } });
}
async function consent(wrapper: ReturnType<typeof open>) {
  const details = wrapper.get('details');
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger('toggle');
  await wrapper.get('input[type="checkbox"]').setValue(true);
}
const approve = (wrapper: ReturnType<typeof open>) => wrapper.get('[data-testid="approveSigning"] button');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.deny.mockResolvedValue(false);
  mocks.push.mockResolvedValue(undefined);
  mocks.approveSign.mockResolvedValue(true);
  mocks.store = reactive({ approveSign: mocks.approveSign, signAllRequests: { substrate: [], evm: {}, solana: {} } });
});

describe('queued transaction approvals', () => {
  it('releases the pending control for the next signing request after the first response', async () => {
    let finishFirst: (value: boolean) => void = () => undefined;
    mocks.approveSign.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishFirst = resolve; }));
    setRequests(request('first'), request('second'));
    const wrapper = open();
    await flushPromises();
    await consent(wrapper);
    await approve(wrapper).trigger('click');
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'first' });

    setRequests(request('second'));
    finishFirst(true);
    await flushPromises();
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    await consent(wrapper);
    expect(approve(wrapper).attributes('aria-disabled')).toBeUndefined();
    await approve(wrapper).trigger('click');
    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'second' });
    expect(mocks.push).not.toHaveBeenCalledWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it('keeps the next mobile request available for a separate explicit approval', async () => {
    setRequests(request('first', true), request('second', true));
    const wrapper = open();
    await flushPromises();
    await consent(wrapper);
    await approve(wrapper).trigger('click');
    await flushPromises();
    setRequests(request('second', true));
    await flushPromises();
    expect(mocks.approveSign).toHaveBeenCalledTimes(1);
    await consent(wrapper);
    await approve(wrapper).trigger('click');
    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'second' });
    expect(mocks.approveSign).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
