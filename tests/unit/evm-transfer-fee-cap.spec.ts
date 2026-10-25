import { Transaction, Wallet, parseUnits, type TransactionLike } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEVMTransfer, maximumEvmNetworkFee } from '@extension-base/api/evm/transfer';
import type State from '@extension-base/background/handlers/State';

const fixture = vi.hoisted(() => ({ state: {} }));
vi.mock('@extension-base/background/handlers', () => ({ state: fixture.state }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));

// Unfunded public key; the provider is a stub and nothing reaches a network.
const sender = new Wallet('0x' + '11'.repeat(32));
const recipient = '0x' + '22'.repeat(20);
const gwei = (value: string) => parseUnits(value, 'gwei');
let state: State;
let broadcastTransaction: ReturnType<typeof vi.fn>;

// The node quotes and then sends at `feeData`. `legacy` is a network without EIP-1559 fees.
function node(feeData: { maxFeePerGas: bigint | null; maxPriorityFeePerGas: bigint | null; gasPrice: bigint | null }, legacy = false) {
  broadcastTransaction = vi.fn(async () => ({ hash: '0x' + 'ab'.repeat(32) }));
  const provider = {
    broadcastTransaction,
    estimateGas: async () => 21000n,
    getBlock: async () => ({ baseFeePerGas: legacy ? null : gwei('4') }),
    getFeeData: async () => feeData,
  };
  Object.assign(provider, { provider });
  state = {
    keyringService: { isResetting: false, walletResetRevision: 0 },
    balanceService: { evmBalanceService: { fetchBalance: vi.fn() } },
    getEvmApi: () => ({ api: provider }),
  } as unknown as State;
  Object.assign(fixture.state, state);
  vi.spyOn(Wallet.prototype, 'populateTransaction').mockImplementation(async (tx) =>
    (legacy
      ? { ...tx, chainId: 1n, nonce: 7, type: 0, gasPrice: feeData.gasPrice, maxFeePerGas: null, maxPriorityFeePerGas: null }
      : { ...tx, chainId: 1n, nonce: 7, type: 2 }) as TransactionLike<string>
  );
}

const send = (approvedMaxFee?: string) => {
  const callback = vi.fn();
  const sending = makeEVMTransfer(
    {
      from: sender.address,
      to: recipient,
      networkKey: 'Ethereum',
      amount: '0.01',
      privateKey: sender.privateKey,
      balance: { isUtility: true, id: 'ETH' } as never,
      callback,
      approvedMaxFee,
    },
    state
  );

  return { sending, callback };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the reviewed EVM network fee is a ceiling', () => {
  it('sends when the fee the node asks for now is within the reviewed fee', async () => {
    node({ maxFeePerGas: gwei('10'), maxPriorityFeePerGas: gwei('1'), gasPrice: null });
    // 21000 gas at 10 gwei.
    const { sending, callback } = send('0.00021');

    await sending;

    expect(broadcastTransaction).toHaveBeenCalledOnce();
    expect(Transaction.from(broadcastTransaction.mock.calls[0][0]).maxFeePerGas).toBe(gwei('10'));
    expect(callback).toHaveBeenCalledWith({ status: true });
  });

  it('refuses before signing when the node now asks for more than was reviewed', async () => {
    node({ maxFeePerGas: gwei('10'), maxPriorityFeePerGas: gwei('1'), gasPrice: null });
    const { sending, callback } = send('0.000209999');

    await sending;

    expect(broadcastTransaction).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({
      status: false,
      errors: [expect.objectContaining({ message: 'transfer_fee_changed' })],
    });
  });

  it('caps a legacy-fee network by its gas price', async () => {
    node({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: gwei('5') }, true);

    await send('0.000105').sending;
    expect(broadcastTransaction).toHaveBeenCalledOnce();

    node({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: gwei('5') }, true);
    const { sending, callback } = send('0.0001');
    await sending;
    expect(broadcastTransaction).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: false }));
  });

  it('prices the most a transaction can pay', () => {
    expect(maximumEvmNetworkFee({ gasLimit: 21000n, gasPrice: null, maxFeePerGas: gwei('3') })).toBe(gwei('63000'));
    expect(maximumEvmNetworkFee({ gasLimit: 21000n, gasPrice: gwei('2'), maxFeePerGas: null })).toBe(gwei('42000'));
    expect(() => maximumEvmNetworkFee({ gasLimit: 0n, gasPrice: gwei('2'), maxFeePerGas: null })).toThrow('transfer_fee_unavailable');
    expect(() => maximumEvmNetworkFee({ gasLimit: 21000n, gasPrice: null, maxFeePerGas: null })).toThrow('transfer_fee_unavailable');
  });
});
