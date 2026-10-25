import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { BasicTxErrorCode, type BasicTxResponse } from '@extension-base/background/types/types';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const { makeCrossChain } = vi.hoisted(() => ({ makeCrossChain: vi.fn() }));

vi.mock('@/extension/messaging', () => ({
  makeCrossChain,
  makePool: vi.fn(),
  makeStaking: vi.fn(),
  makeSwap: vi.fn(),
  makeTransfer: vi.fn(),
}));

vi.mock('@/extension/messaging/nfts', () => ({ sendNft: vi.fn() }));

import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

const FAILURE: BasicTxResponse = {
  status: false,
  errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: '1010: Invalid Transaction: Inability to pay some fees' }],
};

type Background = (callback: (response: BasicTxResponse) => void) => Promise<BasicTxResponse>;

const mountPopup = async (originNet: string, background: Background) => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    length: 0,
  });
  setActivePinia(createPinia());
  makeCrossChain.mockImplementation(async (_request: unknown, callback: (response: BasicTxResponse) => void) =>
    background(callback)
  );

  const wrapper = mount(ConfirmationPasswordPopup, {
    props: {
      amount: '1',
      currency: { symbol: 'dot' },
      extrinsicType: 'crossChain',
      fee: '0.1',
      tx: { originNet, destinationNet: 'Polkadot' },
    },
    global: {
      mocks: { $n: (value: number) => String(value), $t: (key: string) => key },
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

  return wrapper;
};

const stateOf = (wrapper: Awaited<ReturnType<typeof mountPopup>>) =>
  (wrapper.vm as unknown as { transactionState: string }).transactionState;

const HASH = 'ab'.repeat(32);

describe.each([
  ['a non-SORA origin', 'Polkadot'],
  ['a SORA origin', SORA_NETWORK_NAME],
])('cross-chain outcome shown for %s', (_label, originNet) => {
  it('keeps a failure reported by the callback even though the background then answers { status: true }', async () => {
    // Order produced by the background when the node rejects the extrinsic: the subscription message first,
    // then the response of the handler, which only says that the send was started.
    const state = stateOf(
      await mountPopup(originNet, async (callback) => {
        callback(FAILURE);

        return { status: true };
      })
    );

    expect(state).toBe('failed');
  });

  it('shows an early rejection that never reached a subscription instead of staying pending', async () => {
    const state = stateOf(await mountPopup(originNet, async () => FAILURE));

    expect(state).toBe('failed');
  });

  it('shows success when the callback reports it', async () => {
    const state = stateOf(
      await mountPopup(originNet, async (callback) => {
        callback({ status: true });

        return { status: true };
      })
    );

    expect(state).toBe('success');
  });

  it('falls back to the response when no callback ever arrives', async () => {
    const state = stateOf(await mountPopup(originNet, async () => ({ status: true })));

    expect(state).toBe('success');
  });

  it('shows failure when the request itself throws', async () => {
    const state = stateOf(
      await mountPopup(originNet, async () => {
        throw new Error('port closed');
      })
    );

    expect(state).toBe('failed');
  });

  it('shows the hash of an extrinsic included in a block', async () => {
    const wrapper = await mountPopup(originNet, async (callback) => {
      const response = { status: true, transactionHash: HASH };
      callback(response);

      return response;
    });

    expect(stateOf(wrapper)).toBe('success');
    expect(wrapper.find('[data-testid="settledTransactionHash"]').text()).toBe(HASH);
  });

  it('shows the hash of an extrinsic that failed at dispatch', async () => {
    const wrapper = await mountPopup(originNet, async (callback) => {
      const response = { ...FAILURE, transactionHash: HASH.toUpperCase() };
      callback(response);

      return response;
    });

    expect(stateOf(wrapper)).toBe('failed');
    expect(wrapper.find('[data-testid="settledTransactionHash"]').text()).toBe(HASH);
  });

  it.each([['0xnot-a-hash'], [`0x${HASH}`], [42]])('never shows a malformed hash (%j)', async (transactionHash) => {
    const wrapper = await mountPopup(originNet, async (callback) => {
      callback({ status: true, transactionHash } as unknown as BasicTxResponse);

      return { status: true };
    });

    expect(stateOf(wrapper)).toBe('success');
    expect(wrapper.find('[data-testid="settledTransactionHash"]').exists()).toBe(false);
  });

  it('shows a send that may already have gone out, or a refused resend, as unknown with the earlier hash', async () => {
    const wrapper = await mountPopup(originNet, async (callback) => {
      const response: BasicTxResponse = {
        status: false,
        outcome: 'unknown',
        transactionHash: HASH,
        errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'cross_chain_previous_send_unresolved' }],
      };
      callback(response);

      return response;
    });

    expect(stateOf(wrapper)).toBe('unconfirmed');
    expect(wrapper.find('[data-testid="unknownTransactionHash"]').text()).toBe(HASH);
    expect(wrapper.find('[data-testid="transactionUnknownMessage"]').text()).toBe('assets.transactionStatusUnknownDetails');
    expect(wrapper.find('[data-testid="settledTransactionHash"]').exists()).toBe(false);
  });
});
