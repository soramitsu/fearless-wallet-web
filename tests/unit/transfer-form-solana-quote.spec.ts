const { checkTransfer, checkCrossChain } = vi.hoisted(() => ({ checkTransfer: vi.fn(), checkCrossChain: vi.fn() }));

vi.mock('@/extension/messaging', () => ({ checkTransfer, checkCrossChain, checkScamAddress: vi.fn() }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

type FormMethod = (this: Record<string, unknown>, ...args: unknown[]) => unknown;
const component = TransferForm as unknown as {
  computed: Record<string, FormMethod>;
  methods: Record<string, FormMethod>;
};

const WALLET_SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const RECIPIENT = '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E';

const quote = (overrides: Record<string, unknown> = {}) => ({
  accountCreationDeposit: '0.00203928',
  baseFee: '0.000005',
  computeUnitLimit: 20_000,
  computeUnitPriceMicroLamports: 50_000,
  maxSendable: '12.5',
  priorityFee: '0.000001',
  recipientIsTokenAccount: false,
  ...overrides,
});

function context(overrides: Record<string, unknown> = {}) {
  const form: Record<string, unknown> = {
    $emit: vi.fn(),
    accountsStore: { selectedWallet: { address: 'substrate-address', solanaAddress: WALLET_SOLANA_ADDRESS } },
    assetPrice: '1',
    calcTransferableSendMinusFee: vi.fn(),
    currency: {},
    currencyBalance: { precision: 6 },
    estimateFeeError: false,
    estimateFeeErrorMessage: '',
    feeQuoteRevision: 0,
    isBitcoinTransferDisabled: false,
    isFetchingFees: false,
    isTransfer: true,
    isValidAddressByNetwork: true,
    isValidRecipientAddress: true,
    solanaPriceHint: null,
    solanaQuote: null,
    syncedAmount: '',
    syncedAssetId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    syncedDestNet: '',
    syncedFee: '',
    syncedNetwork: 'Solana',
    syncedRecipient: RECIPIENT,
    targetNetwork: 'Solana',
    timeoutSubscription: undefined,
    transactionAddress: 'stored-account',
    transferableAmount: '12.5',
    ...overrides,
  };

  for (const [name, method] of Object.entries(component.methods)) form[name] ??= method.bind(form);

  return form;
}

describe('Solana quote on the send form', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prices a zero-amount transfer until an amount is entered, so it never reports a balance shortfall', async () => {
    const form = context({ syncedAmount: '' });

    checkTransfer.mockResolvedValue({ estimateFee: '0.000006', destEstimateFee: '0', solana: quote() });
    await component.methods.verifyTx.call(form);

    expect(checkTransfer).toHaveBeenCalledWith(expect.objectContaining({ amount: '0', to: RECIPIENT }));

    form.syncedAmount = '3';
    await component.methods.verifyTx.call(form);
    expect(checkTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '3' }));
  });

  it("quotes the wallet's own Solana address until a recipient is entered", () => {
    const form = context();

    expect(component.methods.getFeeEstimateRecipient.call(form)).toBe(WALLET_SOLANA_ADDRESS);
  });

  it('keeps the quote, shows the account deposit only when there is one, and clears both on an edit', async () => {
    const form = context({ syncedAmount: '3' });

    checkTransfer.mockResolvedValue({ estimateFee: '0.00204528', destEstimateFee: '0', solana: quote() });
    await component.methods.calculateEstimates.call(form);

    expect(form.syncedFee).toBe('0.00204528');
    expect(form.solanaQuote).toMatchObject({ computeUnitPriceMicroLamports: 50_000 });
    expect(component.computed.solanaAccountCreationDeposit.call(form)).toBe('0.00203928');

    form.solanaQuote = quote({ accountCreationDeposit: '0' });
    expect(component.computed.solanaAccountCreationDeposit.call(form)).toBe('');

    form.solanaQuote = quote();
    component.methods.calculateFee.call(form);
    expect(form.solanaQuote).toBeNull();
    expect(form.syncedFee).toBe('');
    clearTimeout(form.timeoutSubscription as ReturnType<typeof setTimeout>);
  });

  it('sends the reviewed fee ceiling and the priority fee the user reviewed', () => {
    const form = context({ solanaQuote: quote(), syncedAmount: '3', syncedFee: '0.00204528' });

    expect(component.computed.tx.call(form)).toMatchObject({
      approvedMaxFee: '0.00204528',
      networkKey: 'Solana',
      solanaComputeUnitPriceMicroLamports: 50_000,
      to: RECIPIENT,
    });
  });

  it('uses the quoted maximum, which leaves room for the fee and any account deposit', async () => {
    const form = context();

    checkTransfer.mockResolvedValue({
      estimateFee: '0.00204528',
      destEstimateFee: '0',
      maxAmount: '12.5',
      solana: quote({ maxSendable: '12.5' }),
    });
    await component.methods.setMax.call(form);

    // The whole balance is never quoted as the amount: the fee and any deposit come out of it.
    expect(checkTransfer).toHaveBeenCalledWith(expect.objectContaining({ amount: '0', sendMax: true }));
    expect(form.syncedAmount).toBe('12.5');
    expect(form.syncedFee).toBe('0.00204528');
    expect(form.solanaQuote).toMatchObject({ maxSendable: '12.5' });
    expect(form.calcTransferableSendMinusFee).not.toHaveBeenCalled();
  });

  describe('pricing the amount Max produced', () => {
    const maxQuote = (price: number) => ({
      estimateFee: '0.00204528',
      destEstimateFee: '0',
      maxAmount: '12.5',
      solana: quote({ computeUnitPriceMicroLamports: price, maxSendable: '12.5' }),
    });
    const lastPin = () => checkTransfer.mock.lastCall?.[0].solanaComputeUnitPriceMicroLamports;

    it("quotes the amount Max produced at the priority fee Max quoted, so a price that moved cannot make it a shortfall", async () => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(maxQuote(1_000));
      await component.methods.setMax.call(form);
      // The amount watcher then clears the quote and schedules a new one, which quotes the entered amount.
      form.syncedAmount = '12.5';
      component.methods.calculateFee.call(form);
      clearTimeout(form.timeoutSubscription as ReturnType<typeof setTimeout>);
      checkTransfer.mockResolvedValueOnce(maxQuote(1_000));
      await component.methods.verifyTx.call(form);

      expect(checkTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '12.5' }));
      expect(lastPin()).toBe(1_000);
    });

    it('prices any other amount afresh', async () => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(maxQuote(1_000));
      await component.methods.setMax.call(form);
      form.syncedAmount = '3';
      checkTransfer.mockResolvedValueOnce({ estimateFee: '0.000006', destEstimateFee: '0', solana: quote() });
      await component.methods.verifyTx.call(form);

      expect(lastPin()).toBeUndefined();
    });

    it.each([
      ['asset', { syncedAssetId: 'SOL' }],
      ['network', { syncedNetwork: 'Solana Devnet' }],
    ])("does not carry Max's price to another %s", async (_label, change) => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(maxQuote(1_000));
      await component.methods.setMax.call(form);
      form.syncedAmount = '12.5';
      Object.assign(form, change);
      checkTransfer.mockResolvedValueOnce({ estimateFee: '0.000006', destEstimateFee: '0', solana: quote() });
      await component.methods.verifyTx.call(form);

      expect(lastPin()).toBeUndefined();
    });

    it('prices afresh once the hint is old', async () => {
      vi.useFakeTimers();

      try {
        const form = context();

        checkTransfer.mockResolvedValueOnce(maxQuote(1_000));
        await component.methods.setMax.call(form);
        form.syncedAmount = '12.5';
        await vi.advanceTimersByTimeAsync(61_000);
        checkTransfer.mockResolvedValueOnce(maxQuote(50_000));
        await component.methods.verifyTx.call(form);

        expect(lastPin()).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('asks for no pin when nothing has been quoted by Max', async () => {
      const form = context({ syncedAmount: '3' });

      checkTransfer.mockResolvedValueOnce({ estimateFee: '0.000006', destEstimateFee: '0', solana: quote() });
      await component.methods.verifyTx.call(form);

      expect(lastPin()).toBeUndefined();
    });
  });

  it('shows a recipient problem the quote found instead of a generic fee error', async () => {
    const form = context({ syncedAmount: '1' });

    checkTransfer.mockResolvedValue({
      estimateFee: '0.000006',
      destEstimateFee: '0',
      errors: [{ code: 'TRANSFER_ERROR', message: 'solana_recipient_program' }],
      solana: quote({ unavailableReason: 'solana_recipient_program' }),
    });
    await component.methods.calculateEstimates.call(form);

    expect(form.estimateFeeError).toBe(true);
    expect(form.estimateFeeErrorMessage).toBe('assets.solanaRecipientProgram');
  });
});
