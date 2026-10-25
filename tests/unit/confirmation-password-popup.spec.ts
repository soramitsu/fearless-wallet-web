import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { BasicTxErrorCode, type BasicTxResponse } from '@extension-base/background/types/types';
import { SoraSubmissionUnknownError, soraSubmissionUnknownResponse } from '@/sora/submission';

const { makeTransfer, makeSwap, makePool, makeStaking } = vi.hoisted(() => ({
  makeTransfer: vi.fn(), makeSwap: vi.fn(), makePool: vi.fn(), makeStaking: vi.fn(),
}));

vi.mock('@/extension/messaging', () => ({
  makeCrossChain: vi.fn(),
  makePool,
  makeStaking,
  makeSwap,
  makeTransfer,
}));

vi.mock('@/extension/messaging/nfts', () => ({ sendNft: vi.fn() }));

import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

let transferCallback: ((response: BasicTxResponse) => void) | undefined;
const router = { push: vi.fn() };

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

const mountPopup = async (rejectDirectRequest: boolean | Error = false, props: Record<string, unknown> = {}) => {
  vi.stubGlobal('localStorage', createLocalStorageStub());
  setActivePinia(createPinia());
  transferCallback = undefined;
  makeTransfer.mockImplementation(async (_request: unknown, callback: (response: BasicTxResponse) => void) => {
    transferCallback = callback;

    if (rejectDirectRequest instanceof Error) throw rejectDirectRequest;
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
      ...props,
    },
    global: {
      mocks: {
        $n: (value: number) => String(value),
        $router: router,
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
  if (!props.extrinsicType || props.extrinsicType === 'transfer') expect(transferCallback).toBeTypeOf('function');

  return wrapper;
};

describe('confirmation password transaction failures', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['swap', 'addLiquidity', 'bond'])(
    'shows uncertain SORA %s completion without failure or another submission', async (extrinsicType) => {
      const submit = extrinsicType === 'swap' ? makeSwap : extrinsicType === 'bond' ? makeStaking : makePool;
      const hash = 'ab'.repeat(32);
      submit.mockResolvedValue(soraSubmissionUnknownResponse(new SoraSubmissionUnknownError(`0x${hash}`)));
      const wrapper = await mountPopup(false, { extrinsicType });

      expect(wrapper.get('[data-testid="transactionUnknownMessage"]').text())
        .toBe('assets.transactionStatusUnknownDetails');
      expect(wrapper.get('[data-testid="unknownTransactionHash"]').text()).toBe(hash);
      expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="confirmedTransferAmount"]').exists()).toBe(false);
      expect(submit).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    }
  );

  it('warns that a SORA swap may have been submitted even when no hash was received', async () => {
    makeSwap.mockResolvedValue(soraSubmissionUnknownResponse(new SoraSubmissionUnknownError()));
    const wrapper = await mountPopup(false, { extrinsicType: 'swap' });

    expect(wrapper.get('[data-testid="transactionUnconfirmedMessage"]').text())
      .toBe('assets.transactionStatusUnknownDetails');
    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
    expect(makeSwap).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows an uncertain outcome with its hash, without claiming failure or retrying', async () => {
    const wrapper = await mountPopup();
    const hash = 'ab'.repeat(32);

    transferCallback?.({
      status: false,
      outcome: 'unknown',
      transactionHash: hash,
      errors: [{ message: 'private provider diagnostic' }],
    });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionUnknownMessage"]').text())
      .toBe('assets.transactionStatusUnknownDetails');
    expect(wrapper.get('[data-testid="unknownTransactionHash"]').text()).toBe(hash);
    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirmedTransferAmount"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pending"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('private provider diagnostic');
    expect(makeTransfer).toHaveBeenCalledTimes(1);
  });

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

describe('confirmation popup for a send the network may already have', () => {
  beforeEach(() => vi.clearAllMocks());

  const bitcoinSend = {
    amount: '0.0005',
    currency: { groupId: 'BTC', symbol: 'btc' },
    fee: '0',
    tx: { networkKey: 'Bitcoin' },
    value: '30',
  };

  it('says the transfer is not confirmed yet instead of calling it an error', async () => {
    const wrapper = await mountPopup(false, bitcoinSend);

    transferCallback?.({ status: false, errors: [{ message: 'bitcoin_broadcast_ambiguous' }] });
    await nextTick();

    const popup = wrapper.vm as unknown as { headerType: string; popupHeader: string };

    expect(popup.headerType).toBe('pending');
    expect(popup.popupHeader).toBe('assets.transactionUnconfirmed');
    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="transactionUnconfirmedMessage"]').text()).toBe(
      'assets.bitcoinBroadcastUnconfirmed'
    );
    // The full amount, not "-0" and not a minus sign: it has not left the wallet for certain.
    expect(wrapper.get('[data-testid="confirmedTransferAmount"]').text()).toBe('0.0005 BTC');
    expect(wrapper.get('[data-testid="confirmedTransferValue"]').text()).toContain('30');
  });

  it('offers the asset history on that network as the next step', async () => {
    const wrapper = await mountPopup(false, bitcoinSend);

    transferCallback?.({ status: false, errors: [{ message: 'solana_broadcast_ambiguous' }] });
    await nextTick();
    await wrapper.get('[data-testid="viewHistoryBtn"]').trigger('click');

    expect(router.push).toHaveBeenCalledWith({
      name: 'AssetHistory',
      params: { assetId: 'BTC', selectedNetwork: 'Bitcoin' },
    });
    // The popup names the route without importing the route table.
    expect(readFileSync(resolve(__dirname, '../../src/router/routes.ts'), 'utf8')).toMatch(
      /AssetHistory = 'AssetHistory'/u
    );
  });

  it('shows no "-0" amount for a failed send that charged nothing', async () => {
    const wrapper = await mountPopup(false, bitcoinSend);

    transferCallback?.({ status: false, errors: [{ message: 'bitcoin_broadcast_rejected' }] });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('assets.bitcoinBroadcastRejected');
    expect(wrapper.find('[data-testid="confirmedTransferAmount"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="viewHistoryBtn"]').exists()).toBe(false);
  });
});

describe('a send from an account that waits for a password', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['legacy_password_required', 'migration.legacyPasswordRequired'],
    ['previous_password_required', 'accountAccess.previousPasswordRequired'],
  ])('%s: says why nothing was sent and opens Account access for the sender', async (code, message) => {
    const wrapper = await mountPopup(new Error(code), {
      tx: { from: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', networkKey: 'Ethereum' },
    });

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe(message);
    await wrapper.get('[data-testid="unlockAccountBtn"]').trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AccountAccessRecovery',
      query: { address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' },
    });
    expect(wrapper.emitted('close')).toBeUndefined();
    // The popup names the route without importing the route table.
    expect(readFileSync(resolve(__dirname, '../../src/router/routes.ts'), 'utf8')).toMatch(
      /AccountAccessRecovery = 'AccountAccessRecovery'/u
    );
  });

  it('offers the unlock for a TON phrase reported through the transfer callback', async () => {
    const wrapper = await mountPopup(false, { tx: { from: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI' } });

    transferCallback?.({ status: false, errors: [{ message: 'ton_seed_needs_previous_password' }] });
    await nextTick();

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe(
      'accountAccess.previousPasswordRequired'
    );
    expect(wrapper.find('[data-testid="unlockAccountBtn"]').exists()).toBe(true);
  });

  it('keeps other failures without the unlock action', async () => {
    const wrapper = await mountPopup(true);

    expect(wrapper.get('[data-testid="transactionErrorMessage"]').text()).toBe('assets.transactionFailedDetails');
    expect(wrapper.find('[data-testid="unlockAccountBtn"]').exists()).toBe(false);
  });
});
