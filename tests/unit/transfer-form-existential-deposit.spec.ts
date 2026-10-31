import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  balance: {} as Record<string, unknown>,
  checkTransfer: vi.fn(),
  network: {
    active: true,
    addressPrefix: 0,
    assets: [{ id: 'dot', isUtility: true, precision: 10, symbol: 'DOT' }],
    chainId: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
    ecosystem: 'substrate',
    favorite: [],
    name: 'Polkadot',
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
    getAssetPrice: () => ({ price: 4 }),
    getNetwork: () => mocks.network,
    networks: [mocks.network],
  }),
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [],
    acountsEcosystem: [],
    balances: [{ balances: [mocks.balance], groupId: 'dot', priceId: 'polkadot', relayChain: 'polkadot', symbol: 'DOT' }],
    fiatSymbol: '$',
    selectedNetwork: 'Polkadot',
    selectedWallet: { address: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5', name: 'Wallet' },
  }),
}));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: () => '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    isBitcoinNetwork: () => false,
    isEthereumNetwork: () => false,
    isSameAddress: () => false,
    isSolanaNetwork: () => false,
    validateAddress: () => true,
    validateAddressByNetwork: () => true,
  },
}));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

const RECIPIENT = '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3';
// Polkadot's existential deposit, 1 DOT, in planck.
const ONE_DOT = '10000000000';
const FEE = '0.0158';

type Form = { setMax: () => Promise<void>; step: number };

function mountForm(amount = '') {
  const form = ref<Form>();
  const state = { amount: ref(amount), fee: ref(''), value: ref('') };
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          TransferForm,
          {
            ref: form,
            amount: state.amount.value,
            assetId: 'dot',
            extrinsicType: 'transfer',
            partialFee: state.fee.value,
            recipient: RECIPIENT,
            selectedNetwork: 'Polkadot',
            value: state.value.value,
            'onUpdate:amount': (value: string) => (state.amount.value = value),
            'onUpdate:partialFee': (value: string) => (state.fee.value = value),
            'onUpdate:value': (value: string) => (state.value.value = value),
          },
          { step2: () => h('div', { 'data-testid': 'review' }) }
        );
    },
  });
  const wrapper = mount(Host, {
    global: {
      mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
      stubs: {
        AboveForm: { template: '<main><slot /></main>' },
        Alert: true,
        BadgeButton: true,
        ConfirmationPasswordPopup: true,
        EditAddressBook: true,
        FButton: { emits: ['click'], props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')" />' },
        FInput: true,
        HistoryBook: true,
        InfoRow: true,
        InputWithIcon: true,
        NotificationPopup: {
          emits: ['handlerAccept', 'handlerClose'],
          props: ['headers'],
          template:
            '<div data-testid="existentialPopup">{{ headers.text }}' +
            '<button data-testid="acceptBtn" @click="$emit(\'handlerAccept\')" />' +
            '<button data-testid="closeBtn" @click="$emit(\'handlerClose\')" /></div>',
        },
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

  return { form: () => form.value!, state, wrapper };
}

async function quoted() {
  await flushPromises();
  await vi.advanceTimersByTimeAsync(2100);
  await flushPromises();
}

describe('Send screen existential deposit warning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    mocks.network.ecosystem = 'substrate';
    // 1.5 DOT, no locks, and the network's existential deposit loaded.
    mocks.balance = {
      existentialDeposit: ONE_DOT,
      id: 'dot',
      isUtility: true,
      name: 'Polkadot',
      precision: 10,
      total: '1.5',
      transferable: '1.5',
    };
    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockResolvedValue({ destEstimateFee: '0', errors: [], estimateFee: FEE });
  });

  afterEach(() => vi.useRealTimers());

  it('asks before a send that leaves the account below the existential deposit, and stays on the form on Reject', async () => {
    // 1.5 - 1 - 0.0158 leaves 0.4842 DOT, which the chain would burn with the account.
    const { form, wrapper } = mountForm('1');

    await quoted();
    expect(wrapper.get('[data-testid="continueBtn"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[data-testid="continueBtn"]').trigger('click');

    expect(wrapper.get('[data-testid="existentialPopup"]').text()).toBe('assets.existentialDepositText');
    expect(form().step).toBe(1);

    await wrapper.get('[data-testid="closeBtn"]').trigger('click');

    expect(wrapper.find('[data-testid="existentialPopup"]').exists()).toBe(false);
    expect(form().step).toBe(1);
    expect(wrapper.find('[data-testid="review"]').exists()).toBe(false);
  });

  it('goes on to the review once the warning is accepted', async () => {
    const { form, wrapper } = mountForm('1');

    await quoted();
    await wrapper.get('[data-testid="continueBtn"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');

    expect(wrapper.find('[data-testid="existentialPopup"]').exists()).toBe(false);
    expect(form().step).toBe(2);
    expect(wrapper.find('[data-testid="review"]').exists()).toBe(true);
  });

  it('sends Max, which leaves nothing behind, without asking', async () => {
    const { form, state, wrapper } = mountForm();

    await quoted();
    await form().setMax();
    await quoted();

    expect(state.amount.value).toBe('1.4842');
    await wrapper.get('[data-testid="continueBtn"]').trigger('click');

    expect(wrapper.find('[data-testid="existentialPopup"]').exists()).toBe(false);
    expect(form().step).toBe(2);
  });

  it.each([
    ['leaves exactly the existential deposit', '0.4842', ONE_DOT],
    ['leaves more than the existential deposit', '0.1', ONE_DOT],
    ['has no existential deposit loaded', '1', undefined],
    ['is on a network without an existential deposit', '1', '0'],
  ])('goes straight to the review for a send that %s', async (_case, amount, existentialDeposit) => {
    mocks.balance.existentialDeposit = existentialDeposit;
    const { form, wrapper } = mountForm(amount);

    await quoted();
    await wrapper.get('[data-testid="continueBtn"]').trigger('click');

    expect(wrapper.find('[data-testid="existentialPopup"]').exists()).toBe(false);
    expect(form().step).toBe(2);
  });
});

describe('Send screen existential deposit check', () => {
  const check = (TransferForm as unknown as { computed: Record<string, (this: unknown) => boolean> }).computed
    .leavesDustBelowExistentialDeposit;
  const form = (overrides: Record<string, unknown> = {}, balance: Record<string, unknown> = {}) => ({
    currencyBalance: { existentialDeposit: ONE_DOT, isUtility: true, precision: 10, transferable: '1.5', ...balance },
    isTransfer: true,
    originNet: { ecosystem: 'substrate' },
    syncedAmount: '1',
    syncedFee: FEE,
    ...overrides,
  });

  it('counts the fee, exactly, in what the send leaves', () => {
    expect(check.call(form())).toBe(true);
    // 1.5 - 0.4842 - 0.0158 is exactly 1 DOT.
    expect(check.call(form({ syncedAmount: '0.4842' }))).toBe(false);
    expect(check.call(form({ syncedAmount: '0.4842000001' }))).toBe(true);
    // 1 planck left is still below the existential deposit.
    expect(check.call(form({ syncedAmount: '1.4841999999' }))).toBe(true);
    expect(check.call(form({ syncedAmount: '1.4842' }))).toBe(false);
  });

  it.each(['ethereum', 'ethereumBased', 'ton', 'solana', 'bitcoin', 'iroha'])('leaves %s sends alone', (ecosystem) => {
    expect(check.call(form({ originNet: { ecosystem } }))).toBe(false);
  });

  it('leaves cross-chain sends, which check the deposit themselves, and other assets alone', () => {
    expect(check.call(form({ isTransfer: false }))).toBe(false);
    expect(check.call(form({}, { isUtility: false }))).toBe(false);
    expect(check.call(form({ currencyBalance: undefined }))).toBe(false);
  });
});
