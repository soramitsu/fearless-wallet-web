import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import type { SigningRequest } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({
  approveSign: vi.fn(),
  store: {} as Record<string, unknown>,
  accounts: { accounts: [{ address: 'account', isMobile: false }], selectedWallet: { address: 'account' } },
}));

vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/util/BaseApi', () => ({ default: { encodeAddress: (address: string) => address } }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value }));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({
  default: {
    setSignedExtensions: vi.fn(),
    createType: () => ({ nonce: 0, genesisHash: '0x00', specVersion: 1, method: '0x01' }),
  },
}));
vi.mock('@/screens/extension-ui/signing/WalletInfo.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/extension-ui/InfoList.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/screens/extension-ui/InfoItem.vue', () => ({ default: { template: '<div />' } }));

import Transaction from '@/screens/extension-ui/signing/Transaction.vue';

const request = (id: string): SigningRequest =>
  ({
    id,
    url: `https://${id}.example`,
    account: { address: 'account', name: 'Wallet' },
    request: { payload: { address: 'account', method: '0x01', signedExtensions: [], version: 4 } },
  }) as SigningRequest;

function mountTransaction() {
  return mount(Transaction, {
    global: {
      stubs: {
        AboveForm: { template: '<div><slot /></div>' },
        Loader: true,
        FButton: {
          props: ['disabled', 'text'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.accounts[0].isMobile = false;
  mocks.store = reactive({
    approveSign: mocks.approveSign,
    signRequestPayload: request('first').request.payload,
    signAllRequests: { substrate: [request('first'), request('second')], evm: {}, solana: {} },
  });
});

describe('queued transaction approvals', () => {
  it('enables approval of the next signing request when the subscription changes requests', async () => {
    let finishFirst: () => void = () => undefined;
    mocks.approveSign.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        })
    );
    const wrapper = mountTransaction();
    await wrapper.get('button:last-child').trigger('click');
    expect(wrapper.get('button:last-child').attributes('disabled')).toBeDefined();
    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'first' });

    Object.assign(mocks.store, { signAllRequests: { substrate: [request('second')], evm: {}, solana: {} } });
    await nextTick();
    finishFirst();
    await nextTick();

    expect(wrapper.get('button:last-child').attributes('disabled')).toBeUndefined();
    await wrapper.get('button:last-child').trigger('click');
    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'second' });
    wrapper.unmount();
  });

  it('starts mobile signing again when the next request becomes active', async () => {
    mocks.accounts.accounts[0].isMobile = true;
    const wrapper = mountTransaction();
    expect(mocks.approveSign).toHaveBeenCalledWith({ id: 'first' });

    Object.assign(mocks.store, { signAllRequests: { substrate: [request('second')], evm: {}, solana: {} } });
    await nextTick();

    expect(mocks.approveSign).toHaveBeenLastCalledWith({ id: 'second' });
    expect(mocks.approveSign).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
