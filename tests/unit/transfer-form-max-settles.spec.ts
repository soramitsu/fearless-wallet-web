import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkTransfer: vi.fn(),
  network: {
    active: true,
    assets: [{ id: 'ETH', isUtility: true, precision: 18, symbol: 'ETH' }],
    chainId: '8453',
    ecosystem: 'ethereum',
    favorite: [],
    name: 'Base',
  },
}));

vi.mock('@/extension/messaging', () => ({
  checkCrossChain: vi.fn(),
  checkScamAddress: vi.fn(async () => ({ info: null, value: false })),
  checkTransfer: mocks.checkTransfer,
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION: true,
}));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: true }));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    allNetworks: [mocks.network],
    getAssetPrice: () => ({ price: 3000 }),
    getNetwork: () => mocks.network,
    networks: [mocks.network],
  }),
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [],
    acountsEcosystem: [],
    balances: [
      {
        balances: [{ id: 'ETH', isUtility: true, name: 'Base', precision: 18, total: '0.5', transferable: '0.5' }],
        groupId: 'ETH',
        priceId: 'ethereum',
        relayChain: 'base',
        symbol: 'ETH',
      },
    ],
    fiatSymbol: '$',
    selectedNetwork: 'Base',
    selectedWallet: { address: '5Grw', ethereumAddress: `0x${'11'.repeat(20)}`, name: 'Wallet' },
  }),
}));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: () => `0x${'11'.repeat(20)}`,
    isBitcoinNetwork: () => false,
    isEthereumNetwork: () => true,
    isSameAddress: () => false,
    isSolanaNetwork: () => false,
    validateAddress: () => true,
    validateAddressByNetwork: () => true,
  },
}));

import { FPNumber } from '@/sora/number';
import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

type Form = {
  buttonDisabled: boolean;
  isFetchingFees: boolean;
  setMax: () => Promise<void>;
  tx: { amount: string; approvedMaxFee: string };
};

// A base fee that changes with every 2-second block: each quote prices a different fee, up or down.
const FEES = ['0.0000211', '0.0000215', '0.0000209', '0.0000222', '0.0000218', '0.0000231', '0.0000226'];

function mountForm() {
  const form = ref<Form>();
  const state = { amount: ref(''), fee: ref(''), recipient: ref(`0x${'22'.repeat(20)}`), value: ref('') };
  const Host = defineComponent({
    setup() {
      return () =>
        h(TransferForm, {
          ref: form,
          amount: state.amount.value,
          assetId: 'ETH',
          extrinsicType: 'transfer',
          partialFee: state.fee.value,
          recipient: state.recipient.value,
          selectedNetwork: 'Base',
          value: state.value.value,
          'onUpdate:amount': (value: string) => (state.amount.value = value),
          'onUpdate:partialFee': (value: string) => (state.fee.value = value),
          'onUpdate:recipient': (value: string) => (state.recipient.value = value),
          'onUpdate:value': (value: string) => (state.value.value = value),
        });
    },
  });

  mount(Host, {
    global: {
      mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
      stubs: {
        AboveForm: { template: '<main><slot /></main>' },
        Alert: true,
        BadgeButton: true,
        ConfirmationPasswordPopup: true,
        EditAddressBook: true,
        ExistentialPopup: true,
        FButton: true,
        FInput: true,
        HistoryBook: true,
        InfoRow: true,
        InputWithIcon: true,
        RecipientInput: true,
        Scroll: { template: '<div><slot /></div>' },
        SelectInput: true,
        SelectPopup: true,
        Tooltip: true,
        WalletInfo: true,
        WarningAddressPopup: true,
      },
    },
  });

  return { form: () => form.value!, state };
}

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
}

// What the send may cost at most: the amount and the fee being approved.
const spends = (amount: string, fee: string) => new FPNumber(amount, 18).add(new FPNumber(fee, 18)).toString();

describe('Send screen Max on a network whose fee moves every block', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    let quote = 0;

    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockImplementation(async () => ({
      destEstimateFee: '0',
      errors: [],
      estimateFee: FEES[quote++ % FEES.length],
    }));
  });

  afterEach(() => vi.useRealTimers());

  it('settles on the balance less the fee being approved and lets the user continue', async () => {
    const { form, state } = mountForm();

    await wait(2100);
    const before = mocks.checkTransfer.mock.calls.length;

    await form().setMax();
    await wait(2500);

    // Max's own quote and one of the amount it filled in; the amount then follows that quote and is not asked again.
    const quotes = mocks.checkTransfer.mock.calls.length - before;
    expect(quotes).toBe(2);
    await wait(30_000);
    expect(mocks.checkTransfer.mock.calls.length - before).toBe(quotes);

    expect(form().isFetchingFees).toBe(false);
    expect(form().buttonDisabled).toBe(false);
    expect(spends(state.amount.value, state.fee.value)).toBe('0.5');
    expect(form().tx).toMatchObject({ amount: state.amount.value, approvedMaxFee: state.fee.value });
  });

  it('still lowers the amount when a later quote prices a higher fee, then settles again', async () => {
    const { form, state } = mountForm();

    await wait(2100);
    await form().setMax();
    await wait(2500);
    const settledAmount = state.amount.value;

    // A new recipient is quoted afresh, at a higher fee.
    mocks.checkTransfer.mockImplementationOnce(async () => ({ destEstimateFee: '0', errors: [], estimateFee: '0.0000400' }));
    const before = mocks.checkTransfer.mock.calls.length;
    state.recipient.value = `0x${'33'.repeat(20)}`;
    await wait(2500);
    await wait(30_000);

    expect(mocks.checkTransfer.mock.calls.length - before).toBe(1);
    expect(state.fee.value).toBe('0.0000400');
    expect(new FPNumber(state.amount.value, 18).lt(new FPNumber(settledAmount, 18))).toBe(true);
    expect(spends(state.amount.value, state.fee.value)).toBe('0.5');
    expect(form().buttonDisabled).toBe(false);
  });
});
