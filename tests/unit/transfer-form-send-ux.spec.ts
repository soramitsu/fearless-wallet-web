const { checkTransfer, checkCrossChain } = vi.hoisted(() => ({ checkTransfer: vi.fn(), checkCrossChain: vi.fn() }));

vi.mock('@/extension/messaging', () => ({ checkTransfer, checkCrossChain, checkScamAddress: vi.fn() }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

type FormMethod = (this: Record<string, unknown>, ...args: unknown[]) => unknown;
const component = TransferForm as unknown as {
  computed: Record<string, FormMethod>;
  methods: Record<string, FormMethod>;
};

const SENDER = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x05572aaaaaaaaaaaaaaaaaaaaaaaaaaaaed6de00f';
// The whole 0.0742 ETH balance less each fee the tests quote.
const MAX_FOR_FEE: Record<string, string> = {
  '0.0000021': '0.0741979',
  '0.0000042': '0.0741958',
  '0.0000063': '0.0741937',
};
const FORM_QUOTE_TIMEOUT_MS = 45_000;

function context(overrides: Record<string, unknown> = {}) {
  const form: Record<string, unknown> = {
    $emit: vi.fn(),
    accountsStore: { selectedWallet: { address: 'substrate-address', ethereumAddress: SENDER } },
    assetPrice: 2_360,
    calcTransferableSendMinusFee: vi.fn((fee: string) => MAX_FOR_FEE[fee]),
    currency: {},
    currencyBalance: { precision: 18 },
    estimateFeeError: false,
    estimateFeeErrorMessage: '',
    feeQuoteRevision: 0,
    isBitcoinTransferDisabled: false,
    isDisableBtn: false,
    isFetchingFees: false,
    isMaxAmount: false,
    isTransfer: true,
    isValidAddressByNetwork: true,
    isValidRecipientAddress: true,
    maxFollowsFee: false,
    solanaPriceHint: null,
    solanaQuote: null,
    step: 1,
    syncedAmount: '',
    syncedAssetId: 'eth',
    syncedDestNet: '',
    syncedFee: '',
    syncedNetwork: 'Ethereum',
    syncedRecipient: RECIPIENT,
    syncedValue: '',
    targetNetwork: 'Ethereum',
    timeoutSubscription: undefined,
    transactionAddress: SENDER,
    transferableAmount: 0.0742,
    ...overrides,
  };

  for (const name of ['canRetryFeeQuote', 'isRecipientError']) {
    Object.defineProperty(form, name, { get: () => component.computed[name].call(form), configurable: true });
  }
  for (const [name, method] of Object.entries(component.methods)) form[name] ??= method.bind(form);

  return form;
}

const feeQuote = (estimateFee: string, extra: Record<string, unknown> = {}) => ({ destEstimateFee: '0', estimateFee, ...extra });

describe('send form', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  describe('network fee', () => {
    it('stops loading when there is nothing to quote', async () => {
      const form = context({ currency: undefined, isFetchingFees: true });

      component.methods.calculateFee.call(form);
      expect(form.isFetchingFees).toBe(false);
      expect(form.timeoutSubscription).toBeUndefined();

      form.isFetchingFees = true;
      await component.methods.calculateEstimates.call(form);
      expect(form.isFetchingFees).toBe(false);
      expect(checkTransfer).not.toHaveBeenCalled();
    });

    it('turns a quote that never answers into an error the user can retry', async () => {
      vi.useFakeTimers();
      const form = context();

      checkTransfer.mockReturnValueOnce(new Promise(() => undefined));
      const pending = component.methods.calculateEstimates.call(form);

      expect(form.isFetchingFees).toBe(true);
      await vi.advanceTimersByTimeAsync(FORM_QUOTE_TIMEOUT_MS);
      await pending;

      expect(form.isFetchingFees).toBe(false);
      expect(form.estimateFeeError).toBe(true);
      expect(form.estimateFeeErrorMessage).toBe('common.estimateFeeError');
      expect(component.computed.buttonText.call(form)).toBe('ux.retry');
      expect(component.computed.buttonDisabled.call(form)).toBe(false);

      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000021'));
      await component.methods.handlerContinueButton.call(form);
      await vi.waitFor(() => expect(form.syncedFee).toBe('0.0000021'));

      expect(form.estimateFeeError).toBe(false);
      expect(form.isFetchingFees).toBe(false);
      expect(form.step).toBe(1);
    });

    it('treats a failed request like a silent one', async () => {
      const form = context();

      checkTransfer.mockRejectedValueOnce(new Error('Wallet background disconnected'));
      await component.methods.calculateEstimates.call(form);

      expect(form.isFetchingFees).toBe(false);
      expect(form.canRetryFeeQuote).toBe(true);
    });

    it('shows a specific problem the quote found, with nothing to retry', async () => {
      const form = context({ syncedNetwork: 'Solana' });

      checkTransfer.mockResolvedValueOnce(
        feeQuote('0.000006', { errors: [{ code: 'TRANSFER_ERROR', message: 'solana_recipient_program' }] })
      );
      await component.methods.calculateEstimates.call(form);

      expect(form.canRetryFeeQuote).toBe(false);
      expect(component.computed.buttonText.call(form)).toBe('assets.solanaRecipientProgram');
      expect(component.computed.buttonDisabled.call(form)).toBe(true);
    });

    it('names the generic fee error by a key that has a translation', async () => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(feeQuote('0', { errors: [{ code: 'TRANSFER_ERROR', message: 'common.estimateFeeError' }] }));
      await component.methods.calculateEstimates.call(form);

      expect(form.estimateFeeErrorMessage).toBe('common.estimateFeeError');
      expect(component.computed.buttonText.call(form)).toBe('ux.retry');
    });
  });

  describe('Max', () => {
    it('sends the whole balance less the fee and keeps following the fee as it moves', async () => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000021'));
      await component.methods.setMax.call(form);

      expect(checkTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '0.0742', sendMax: true }));
      expect(form).toMatchObject({ isMaxAmount: true, maxFollowsFee: true, syncedAmount: '0.0741979', syncedFee: '0.0000021' });

      // Gas went up before the amount was quoted again: the amount follows instead of turning into a shortfall.
      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000042'));
      await component.methods.calculateEstimates.call(form);

      expect(form).toMatchObject({ isMaxAmount: true, syncedAmount: '0.0741958', syncedFee: '0.0000042' });
      expect(form.estimateFeeError).toBe(false);
    });

    it('follows a balance that changes', () => {
      const form = context({ isMaxAmount: true, maxFollowsFee: true, syncedAmount: '0.0741979', syncedFee: '0.0000063' });

      component.methods.onTransferableChange.call(form);

      expect(form.syncedAmount).toBe('0.0741937');
    });

    it('lets go once the amount is edited', async () => {
      const form = context();

      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000021'));
      await component.methods.setMax.call(form);
      component.methods.updateAmount.call(form, '0.05');

      expect(form).toMatchObject({ isMaxAmount: false, maxFollowsFee: false, syncedAmount: '0.05' });

      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000042'));
      await component.methods.calculateEstimates.call(form);
      expect(form.syncedAmount).toBe('0.05');
    });

    it('keeps an exact maximum the quote returned, as quoted', async () => {
      const form = context({ syncedNetwork: 'Bitcoin', transferableAmount: 0.0006 });

      checkTransfer.mockResolvedValueOnce(feeQuote('0.00000356', { maxAmount: '0.00059644' }));
      await component.methods.setMax.call(form);

      expect(form).toMatchObject({ isMaxAmount: true, maxFollowsFee: false, syncedAmount: '0.00059644' });

      checkTransfer.mockResolvedValueOnce(feeQuote('0.00000418'));
      await component.methods.calculateEstimates.call(form);
      expect(form.syncedAmount).toBe('0.00059644');
      expect(form.calcTransferableSendMinusFee).not.toHaveBeenCalled();
    });

    it('switches off when its quote fails, so Try again asks for an ordinary quote', async () => {
      const form = context({ syncedAmount: '0.01' });

      checkTransfer.mockRejectedValueOnce(new Error('Wallet background disconnected'));
      await component.methods.setMax.call(form);

      expect(form).toMatchObject({ isMaxAmount: false, isFetchingFees: false, syncedAmount: '0.01' });
      expect(form.canRetryFeeQuote).toBe(true);

      checkTransfer.mockResolvedValueOnce(feeQuote('0.0000021'));
      await component.methods.handlerContinueButton.call(form);
      await vi.waitFor(() => expect(form.syncedFee).toBe('0.0000021'));
      expect(checkTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '0.01', sendMax: false }));
    });

    it('asks for Max again when a later quote fails while Max is on', () => {
      const form = context({ isMaxAmount: true, maxFollowsFee: true });
      const setMax = vi.fn();
      const calculateEstimates = vi.fn();

      Object.assign(form, { setMax, calculateEstimates });
      component.methods.retryFeeQuote.call(form);

      expect(setMax).toHaveBeenCalled();
      expect(calculateEstimates).not.toHaveBeenCalled();
    });
  });

  describe('recipient', () => {
    it('is flagged only when something that is not a valid address was entered', () => {
      expect(context({ syncedRecipient: '' }).isRecipientError).toBe(false);
      expect(context({ isValidRecipientAddress: false, syncedRecipient: '' }).isRecipientError).toBe(false);
      expect(context({ isValidRecipientAddress: false, syncedRecipient: '0x0557' }).isRecipientError).toBe(true);
      expect(context().isRecipientError).toBe(false);
    });

    it('takes a typed or pasted address as it is', () => {
      const form = context({ syncedRecipient: '' });

      component.methods.updateRecipient.call(form, RECIPIENT);

      expect(form.syncedRecipient).toBe(RECIPIENT);
    });
  });
});
