import { afterEach, describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { BasicTxResponse, RequestTypes } from '@extension-base/background/types/types';

const evm = vi.hoisted(() => ({
  makeEVMTransfer: vi.fn(async (_params: Record<string, unknown>, _state: unknown) => undefined),
  quoteEVMTransfer: vi.fn(async (_params: Record<string, unknown>, _state: unknown) => ({ fee: 210000000000000n, tx: {} })),
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/consts/global')>(), IS_EXTENSION: true, IS_EXTENSION_SMOKE: false,
}));
vi.mock('@/sora', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({ makeEVMTransfer: evm.makeEVMTransfer, quoteEVMTransfer: evm.quoteEVMTransfer }));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({ isBitcoinTransferNetwork: () => false, BitcoinTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/iroha/transfer', () => ({ isIrohaTransferNetwork: () => false, IrohaTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({ isSolanaTransferNetwork: () => false, SolanaTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => ({}));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({
  getBalanceItem: () => ({ isUtility: true, id: 'ETH', transferable: '7' }),
  isNativeEVMNetwork: () => true,
}));
vi.mock('@/helpers', () => ({ isTonNetwork: () => false }));
vi.mock('@/consts/currencies', () => ({}));
vi.mock('@/consts/networks', () => ({ ALL_NETWORKS: 'all' }));
vi.mock('@/cross-chain/requestValidation', () => ({}));
vi.mock('@/defi/polkaswapExecutionGuard', () => ({}));
vi.mock('@extension-base/const', () => ({}));
vi.mock('@extension-base/background/handlers/ExtensionBase', () => ({
  default: class { constructor(protected state: State) {} },
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  evm.makeEVMTransfer.mockClear();
  evm.quoteEVMTransfer.mockClear();
});

function extensionWith(exportKey: ReturnType<typeof vi.fn>, callback: ReturnType<typeof vi.fn>) {
  const extension = new Extension({
    keyringService: { unlockPair: vi.fn(), getSubstrateAddress: () => 'from', accountExportPrivateKey: exportKey },
    subscriptionService: { createSubscription: () => callback },
    networkService: { networkMap: { ethereum: {} } },
    balanceService: { getTokenBalance: () => ({ symbol: 'ETH', balances: [] }) },
  } as unknown as State);

  return extension as unknown as {
    makeTransfer(id: string, request: RequestTypes['pri(accounts.makeTransfer)']): Promise<BasicTxResponse>;
    checkTransfer(request: RequestTypes['pri(accounts.checkTransfer)']): Promise<{ estimateFee: string }>;
  };
}

const request = (extra: Record<string, unknown> = {}) =>
  ({ networkKey: 'ethereum', from: '0xfrom', to: '0xto', assetId: 'ETH', amount: '1', ...extra }) as RequestTypes['pri(accounts.makeTransfer)'];

describe('an EVM send without a reviewed fee', () => {
  it('is refused before the key is opened', async () => {
    vi.useFakeTimers();
    const exportKey = vi.fn(() => ({ privateKey: '0x' + '11'.repeat(32) }));
    const callback = vi.fn();

    const result = await extensionWith(exportKey, callback).makeTransfer('id', request());

    expect(result).toMatchObject({ status: false, errors: [{ message: 'transfer_fee_approval_required' }] });
    expect(callback).toHaveBeenCalledExactlyOnceWith(result);
    expect(exportKey).not.toHaveBeenCalled();
    expect(evm.makeEVMTransfer).not.toHaveBeenCalled();
  });

  it('passes the reviewed fee to the send that enforces it', async () => {
    const exportKey = vi.fn(() => ({ privateKey: '0x' + '11'.repeat(32) }));

    await extensionWith(exportKey, vi.fn()).makeTransfer('id', request({ approvedMaxFee: '0.00021' }));

    expect(evm.makeEVMTransfer).toHaveBeenCalledOnce();
    expect(evm.makeEVMTransfer.mock.calls[0][0]).toMatchObject({ approvedMaxFee: '0.00021', amount: '1', to: '0xto' });
  });
});

describe('the EVM fee quote', () => {
  it.each([
    ['2.5', '2.5'],
    ['', '7'],
    ['0', '7'],
    ['abc', '7'],
  ])('prices an entered amount of %j as %s, the amount the capped send will estimate', async (amount, priced) => {
    const quote = await extensionWith(vi.fn(), vi.fn()).checkTransfer({
      networkKey: 'ethereum', from: '0xfrom', to: '0xto', assetId: 'ETH', amount,
    } as RequestTypes['pri(accounts.checkTransfer)']);

    expect(evm.quoteEVMTransfer.mock.calls[0][0]).toMatchObject({ amount: priced });
    expect(quote.estimateFee).toBe('0.00021');
  });
});
