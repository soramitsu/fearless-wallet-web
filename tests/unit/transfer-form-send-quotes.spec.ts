import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkTransfer: vi.fn(),
  network: {
    active: true,
    assets: [{ id: 'BTC', isUtility: true, precision: 8, symbol: 'BTC' }] as Array<Record<string, unknown>>,
    chainId: 'bitcoin:mainnet',
    ecosystem: 'bitcoin',
    favorite: [],
    name: 'Bitcoin',
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
    getAssetPrice: () => ({ price: 60_000 }),
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
        balances: [{ id: 'BTC', isUtility: true, name: 'Bitcoin', precision: 8, transferable: '0.5', total: '0.6' }],
        groupId: 'BTC',
        priceId: 'bitcoin',
        relayChain: 'bitcoin',
        symbol: 'BTC',
      },
      {
        balances: [{ id: 'SOL', isUtility: true, name: 'Solana', precision: 9, transferable: '20', total: '20' }],
        groupId: 'SOL',
        priceId: 'solana',
        relayChain: 'solana',
        symbol: 'SOL',
      },
    ],
    fiatSymbol: '$',
    selectedNetwork: 'Bitcoin',
    selectedWallet: { address: 'wallet', bitcoinAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', name: 'Wallet' },
  }),
}));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: (_wallet: unknown, network: string) =>
      network === 'Solana' ? 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk' : 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    isBitcoinNetwork: (network: string) => network === 'Bitcoin',
    isEthereumNetwork: () => false,
    isSameAddress: () => false,
    isSolanaNetwork: (network: string) => network === 'Solana',
    validateAddress: (address: string) => address.startsWith('bc1') || address.startsWith('1'),
    validateAddressByNetwork: () => true,
  },
}));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

const bitcoinQuote = {
  awaitingConfirmation: '0.1',
  fee: '0.00000564',
  feeRateSatPerVbyte: 4,
  maxSendable: '0.49999436',
  pendingPreviousSend: false,
  recipientType: 'p2tr',
  spendable: '0.5',
};

const mountForm = (
  props: Record<string, string> = {
    assetId: 'BTC',
    recipient: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    selectedNetwork: 'Bitcoin',
  }
) =>
  mount(TransferForm, {
    props: {
      amount: '',
      extrinsicType: 'transfer',
      partialFee: '',
      ...props,
    },
    global: {
      mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string, props?: Record<string, string>) => (props ? `${key}:${JSON.stringify(props)}` : key) },
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
        InfoRow: { props: ['text', 'value', 'price'], template: '<div class="info-row" :data-text="text">{{ value }}</div>' },
        InputWithIcon: true,
        Scroll: { template: '<div><slot /></div>' },
        SelectInput: { props: ['totalAmount'], template: '<div data-testid="selectInput" :data-total="totalAmount" />' },
        SelectPopup: true,
        Tooltip: true,
        WalletInfo: true,
        WarningAddressPopup: true,
      },
    },
  });

describe('Send screen Bitcoin quote', () => {
  const originalFlag = process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockResolvedValue({ bitcoin: bitcoinQuote, destEstimateFee: '0', errors: [], estimateFee: bitcoinQuote.fee });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalFlag === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
    else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = originalFlag;
  });

  it('quotes against the entered recipient and shows fee rate, spendable and pending coins', async () => {
    const wrapper = mountForm();

    await flushPromises();

    expect(mocks.checkTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '0', to: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr' })
    );
    expect(wrapper.get('[data-text="assets.bitcoinFeeRate"]').text()).toBe('assets.bitcoinFeeRateValue:{"rate":"4"}');
    expect(wrapper.get('[data-testid="selectInput"]').attributes('data-total')).toBe('0.5');
    expect(wrapper.get('[data-testid="bitcoinAwaitingConfirmation"]').text()).toContain('0.1 BTC');
    expect(wrapper.get('[data-testid="bitcoinRecipientTypes"]').text()).toContain('1, 3, bc1q, bc1p');
  });

  it('fills Max with the quoted maximum and sends at the reviewed fee rate', async () => {
    const wrapper = mountForm();

    await flushPromises();
    await (wrapper.vm as unknown as { setMax: () => Promise<void> }).setMax();

    expect(wrapper.emitted('update:amount')?.at(-1)).toEqual(['0.49999436']);
    expect((wrapper.vm as unknown as { tx: Record<string, unknown> }).tx).toMatchObject({ bitcoinFeeRateSatPerVbyte: 4 });
  });

  it('names an earlier send waiting in the mempool and keeps Continue blocked until it confirms', async () => {
    const previousSend = {
      amount: '0.0004',
      inMempool: true,
      recipient: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
      txid: 'ab'.repeat(32),
    };

    mocks.checkTransfer.mockResolvedValue({
      bitcoin: { ...bitcoinQuote, previousSend, unavailableReason: 'bitcoin_previous_send_unconfirmed' },
      destEstimateFee: '0',
      errors: [{ message: 'bitcoin_previous_send_unconfirmed' }],
      estimateFee: bitcoinQuote.fee,
    });

    const wrapper = mountForm();

    await flushPromises();

    expect(wrapper.get('[data-testid="bitcoinPreviousSend"]').text()).toBe(
      `assets.bitcoinPreviousSendOnNetwork:${JSON.stringify({
        amount: '0.0004 BTC',
        recipient: 'bc1p5cyx…kedrcr',
        txid: 'abababab…abababab',
      })}`
    );
    expect((wrapper.vm as unknown as { buttonText: string }).buttonText).toBe('assets.bitcoinPreviousSendUnconfirmed');
  });

  it('says an earlier send of unknown outcome has its coins reused', async () => {
    mocks.checkTransfer.mockResolvedValue({
      bitcoin: {
        ...bitcoinQuote,
        pendingPreviousSend: true,
        previousSend: { amount: '0.0004', inMempool: false, recipient: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', txid: 'cd'.repeat(32) },
      },
      destEstimateFee: '0',
      errors: [],
      estimateFee: bitcoinQuote.fee,
    });

    const wrapper = mountForm();

    await flushPromises();

    expect(wrapper.get('[data-testid="bitcoinPreviousSend"]').text()).toContain('assets.bitcoinPreviousSendReused:');
    expect(wrapper.get('[data-testid="bitcoinPreviousSend"]').text()).toContain('"recipient":"1BvBMSEY…JaNVN2"');
  });

  it('hides the Bitcoin network from the Send pickers while a remote veto is remembered', async () => {
    const { useSendKillSwitchStore } = await import('@/stores/sendKillSwitch');

    useSendKillSwitchStore().killSwitch.vetoes.bitcoinSend = true;

    const wrapper = mountForm();

    await flushPromises();

    expect((wrapper.vm as unknown as { optionsNetworks: unknown[] }).optionsNetworks).toEqual([]);
    expect((wrapper.vm as unknown as { buttonText: string }).buttonText).toBe('assets.bitcoinTransfersDisabled');
  });
});

describe('Send screen Solana quote', () => {
  const originalFlag = process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
    Object.assign(mocks.network, {
      assets: [{ id: 'SOL', isUtility: true, precision: 9, symbol: 'SOL' }],
      chainId: 'solana:mainnet',
      ecosystem: 'solana',
      name: 'Solana',
    });
    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockResolvedValue({
      destEstimateFee: '0',
      errors: [],
      estimateFee: '0.00204428',
      solana: {
        accountCreationDeposit: '0.00203928',
        baseFee: '0.000005',
        computeUnitLimit: 60_000,
        computeUnitPriceMicroLamports: 50_000,
        maxSendable: '12',
        priorityFee: '0.000003',
        recipientIsTokenAccount: false,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.assign(mocks.network, {
      assets: [{ id: 'BTC', isUtility: true, precision: 8, symbol: 'BTC' }],
      chainId: 'bitcoin:mainnet',
      ecosystem: 'bitcoin',
      name: 'Bitcoin',
    });
    if (originalFlag === undefined) delete process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
    else process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = originalFlag;
  });

  it('prices against the wallet’s own Solana address until a recipient is entered and shows the account deposit', async () => {
    const wrapper = mountForm({ assetId: 'SOL', recipient: '', selectedNetwork: 'Solana' });

    await flushPromises();

    expect(mocks.checkTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '0', to: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk' })
    );
    expect(wrapper.get('[data-text="assets.solanaAccountCreation"]').text()).toBe('0.00203928 SOL');
    expect((wrapper.vm as unknown as { tx: Record<string, unknown> }).tx).toMatchObject({
      solanaComputeUnitPriceMicroLamports: 50_000,
    });
  });
});
