import { afterEach, describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { BasicTxResponse, RequestTypes } from '@extension-base/background/types/types';

vi.mock('@/consts/global', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/consts/global')>(), IS_EXTENSION: true, IS_EXTENSION_SMOKE: false,
}));
vi.mock('@sora-substrate/util', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({}));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({ isBitcoinTransferNetwork: () => false, BitcoinTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/iroha/transfer', () => ({ isIrohaTransferNetwork: () => false, IrohaTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({ isSolanaTransferNetwork: () => false, SolanaTransactionStatusUnknownError: class extends Error {} }));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => ({}));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({ makeTonTransfer: async () => { throw new Error('rpc broadcast failed'); } }));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({ getEip155MessageAddress: () => 'old-evm' }));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers/balance', () => ({ getBalanceItem: () => ({}), isNativeEVMNetwork: () => false }));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({ getBalanceItem: () => ({}), isNativeEVMNetwork: () => false }));
vi.mock('@/helpers', () => ({ isTonNetwork: () => true, isNativeEVMNetwork: () => false }));
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
});

describe('transfer failure response', () => {
  it('returns the TON broadcast failure instead of replacing it with success', async () => {
    const callback = vi.fn();
    const extension = new Extension({
      keyringService: { unlockPair: vi.fn(), getSubstrateAddress: () => 'from' },
      subscriptionService: { createSubscription: () => callback },
      networkService: { networkMap: { ton: {} } },
      balanceService: { getTokenBalance: () => ({ symbol: 'TON', balances: [] }) },
    } as unknown as State);
    vi.useFakeTimers();
    // Invoke the same dispatch method used by pri(accounts.makeTransfer).
    const send = extension as unknown as {
      makeTransfer(id: string, request: RequestTypes['pri(accounts.makeTransfer)']): Promise<BasicTxResponse>;
    };
    const result = await send.makeTransfer('id', {
      networkKey: 'ton', from: 'from', to: 'to', assetId: 'TON', amount: '1',
    } as RequestTypes['pri(accounts.makeTransfer)']);
    expect(result).toMatchObject({ status: false, errors: [{ message: 'rpc broadcast failed' }] });
    expect(callback).toHaveBeenCalledExactlyOnceWith(result);
    expect(vi.getTimerCount()).toBe(1);
  });
});
