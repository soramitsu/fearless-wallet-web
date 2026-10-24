const { checkTransfer, checkCrossChain } = vi.hoisted(() => ({ checkTransfer: vi.fn(), checkCrossChain: vi.fn() }));

vi.mock('@/extension/messaging', () => ({ checkTransfer, checkCrossChain, checkScamAddress: vi.fn() }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

type FormMethod = (this: Record<string, unknown>, ...args: unknown[]) => unknown;
const component = TransferForm as unknown as {
  computed: { tx: FormMethod };
  methods: Record<string, FormMethod>;
};

function context() {
  const form: Record<string, unknown> = {
    $emit: vi.fn(),
    assetPrice: '1',
    currency: {},
    currencyBalance: { precision: 8 },
    estimateFeeError: false,
    feeQuoteRevision: 0,
    isBitcoinTransferDisabled: false,
    isFetchingFees: false,
    isTransfer: true,
    isValidAddressByNetwork: true,
    isValidRecipientAddress: true,
    syncedAmount: '0.0005',
    syncedAssetId: 'BTC',
    syncedDestNet: '',
    syncedFee: '0.00000418',
    syncedNetwork: 'Bitcoin',
    syncedRecipient: 'entered-recipient',
    transactionAddress: 'stored-account',
    transferableAmount: '0.0006',
    getFeeEstimateRecipient: vi.fn(() => 'placeholder-recipient'),
    calcTransferableSendMinusFee: vi.fn(),
  };

  for (const [name, method] of Object.entries(component.methods)) form[name] ??= method.bind(form);

  return form;
}

describe('transfer fee approval and max amount', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('quotes the actual recipient and forwards max requests and the reviewed fee cap', async () => {
    const form = context();

    checkTransfer.mockResolvedValue({ estimateFee: '0.00000418', destEstimateFee: '0' });
    await component.methods.verifyTx.call(form, '0.0006', true);
    expect(checkTransfer).toHaveBeenCalledWith(expect.objectContaining({ to: 'entered-recipient', sendMax: true, amount: '0.0006' }));
    expect(component.computed.tx.call(form)).toMatchObject({ approvedMaxFee: '0.00000418', to: 'entered-recipient' });
  });

  it('uses the exact maximum returned by the UTXO quote even after an earlier estimate failed', async () => {
    const form = context();

    form.estimateFeeError = true;
    form.syncedFee = '';
    checkTransfer.mockResolvedValue({ estimateFee: '0.00000356', maxAmount: '0.00059644', destEstimateFee: '0' });
    await component.methods.setMax.call(form);

    expect(form.syncedAmount).toBe('0.00059644');
    expect(form.syncedFee).toBe('0.00000356');
    expect(form.estimateFeeError).toBe(false);
    expect(form.calcTransferableSendMinusFee).not.toHaveBeenCalled();
  });

  it('invalidates the approved fee immediately and ignores an old quote after an edit', async () => {
    vi.useFakeTimers();
    const form = context();
    let complete: (value: unknown) => void = () => undefined;

    form.verifyTx = vi.fn(() => new Promise((resolve) => { complete = resolve; }));
    const pending = component.methods.calculateEstimates.call(form);

    form.syncedAmount = '0.00055';
    component.methods.calculateFee.call(form);
    expect(form.syncedFee).toBe('');
    expect(form.isFetchingFees).toBe(true);
    complete({ estimateFee: '0.00000418', destEstimateFee: '0' });
    await pending;

    expect(form.syncedFee).toBe('');
    expect(form.isFetchingFees).toBe(true);
    vi.clearAllTimers();
  });
});
