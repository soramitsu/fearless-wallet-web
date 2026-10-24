const { handlersState } = vi.hoisted(() => ({ handlersState: { getEvmApi: vi.fn() } }));

// The utility quote reads its provider from the background's shared state.
vi.mock('@extension-base/background/handlers', () => ({ state: handlersState }));

import { EVM_QUOTE_TIMEOUT_MS, quoteEVMTransfer } from '@extension-base/api/evm/transfer';
import type State from '@extension-base/background/handlers/State';

const params = {
  amount: '0.0742',
  balance: { id: 'eth', isUtility: true, precision: 18 },
  from: '0x1111111111111111111111111111111111111111',
  networkKey: 'Ethereum',
  to: '0x2222222222222222222222222222222222222222',
} as unknown as Parameters<typeof quoteEVMTransfer>[0];

// A provider whose socket the node closed: requests written to it are never answered.
const silentProvider = () => ({ getFeeData: vi.fn(() => new Promise(() => undefined)) });

const liveProvider = () => ({
  getFeeData: vi.fn(async () => ({ gasPrice: 2n, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n })),
  provider: {
    estimateGas: vi.fn(async () => 21_000n),
    getBlock: vi.fn(async () => ({ baseFeePerGas: 1n })),
  },
});

function backgroundState() {
  const rebuildApi = vi.fn();

  return { rebuildApi, state: { networkService: { evmApiHandler: { rebuildApi } } } as unknown as State };
}

describe('EVM fee quote', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('asks once more through a rebuilt provider when the node does not answer', async () => {
    const { rebuildApi, state } = backgroundState();

    handlersState.getEvmApi.mockReturnValueOnce({ api: silentProvider() }).mockReturnValue({ api: liveProvider() });

    const quote = quoteEVMTransfer(params, state);

    await vi.advanceTimersByTimeAsync(EVM_QUOTE_TIMEOUT_MS);

    // (max fee 3 + base fee 1) × 21000 gas
    await expect(quote).resolves.toMatchObject({ fee: 84_000n });
    expect(rebuildApi).toHaveBeenCalledWith('Ethereum');
  });

  it('fails within a bounded time when the rebuilt provider is silent too', async () => {
    const { rebuildApi, state } = backgroundState();

    handlersState.getEvmApi.mockReturnValue({ api: silentProvider() });

    const quote = quoteEVMTransfer(params, state);
    const outcome = expect(quote).rejects.toThrow('evm_quote_timeout');

    await vi.advanceTimersByTimeAsync(2 * EVM_QUOTE_TIMEOUT_MS);
    await outcome;
    expect(rebuildApi).toHaveBeenCalledTimes(1);
  });

  it('reports an answer the node gave, without rebuilding anything', async () => {
    const { rebuildApi, state } = backgroundState();
    const failing = liveProvider();

    failing.provider.estimateGas.mockRejectedValue(new Error('execution reverted'));
    handlersState.getEvmApi.mockReturnValue({ api: failing });

    await expect(quoteEVMTransfer(params, state)).rejects.toThrow('execution reverted');
    expect(rebuildApi).not.toHaveBeenCalled();
  });
});
