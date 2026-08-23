import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { BasicTxErrorCode, type BasicTxResponse } from '@extension-base/background/types/types';

const { makeTransfer } = vi.hoisted(() => ({ makeTransfer: vi.fn() }));

vi.mock('@/extension/messaging', () => ({
  makeCrossChain: vi.fn(),
  makePool: vi.fn(),
  makeStaking: vi.fn(),
  makeSwap: vi.fn(),
  makeTransfer,
}));

vi.mock('@/extension/messaging/nfts', () => ({ sendNft: vi.fn() }));

import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

let transferCallback: ((response: BasicTxResponse) => void) | undefined;

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const mountPopup = async (rejectDirectRequest = false) => {
  vi.stubGlobal('localStorage', createLocalStorageStub());
  setActivePinia(createPinia());
  transferCallback = undefined;
  makeTransfer.mockImplementation(async (_request: unknown, callback: (response: BasicTxResponse) => void) => {
    transferCallback = callback;

    if (rejectDirectRequest) throw new Error('private transport failure');

    return { status: true };
  });

  const wrapper = mount(ConfirmationPasswordPopup, {
    props: {
      amount: '1',
      currency: { symbol: 'dot' },
      extrinsicType: 'transfer',
      fee: '0.1',
      tx: {},
    },
    global: {
      mocks: {
        $n: (value: number) => String(value),
        $t: (key: string, params?: Record<string, string>) =>
          key === 'assets.insufficientBalance' ? `Insufficient balance ${params?.asset ?? ''}`.trim() : key,
      },
      stubs: {
        ExternalLogo: { template: '<span />' },
        FButton: { template: '<button />' },
        Icon: { template: '<span />' },
        Loader: { template: '<span data-testid="pending" />' },
        Popup: { template: '<section><slot /></section>' },
        SignMobile: { template: '<span />' },
        Tooltip: { template: '<span />' },
      },
    },
  });

  await flushPromises();
  expect(transferCallback).toBeTypeOf('function');

  return wrapper;
};

describe('confirmation password transaction failures', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces insufficient balance and does not expose raw provider diagnostics', async () => {
    const wrapper = await mountPopup();

    transferCallback?.({
      status: false,
      errors: [
        {
          code: BasicTxErrorCode.BALANCE_TO_LOW,
          message: 'Invalid Transaction: secret provider diagnostic',
        },
      ],
    });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('Insufficient balance DOT');
    expect(wrapper.text()).not.toContain('secret provider diagnostic');
  });

  it('shows a safe generic failure for hostile backend text', async () => {
    const wrapper = await mountPopup();

    transferCallback?.({
      status: false,
      errors: [{ message: '<img src=x onerror="steal()"> bearer-token=secret' }],
    });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('assets.transactionFailedDetails');
    expect(wrapper.html()).not.toContain('bearer-token');
    expect(wrapper.html()).not.toContain('<img src=x');
  });

  it('fails closed when a response contradicts success with an error', async () => {
    const wrapper = await mountPopup();

    transferCallback?.({ status: true, errors: [{ message: 'contradictory response' }] });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('assets.transactionFailedDetails');
    expect(wrapper.text()).not.toContain('contradictory response');
  });

  it('does not render a failure message for an unambiguous success', async () => {
    const wrapper = await mountPopup();

    transferCallback?.({ status: true, errors: [] });
    await nextTick();

    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
  });

  it('leaves pending state and shows a safe failure when the request promise rejects', async () => {
    const wrapper = await mountPopup(true);

    expect(wrapper.find('[data-testid="pending"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('assets.transactionFailedDetails');
    expect(wrapper.text()).not.toContain('private transport failure');
  });
});
