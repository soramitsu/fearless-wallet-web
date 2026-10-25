import { beforeEach, describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { RequestSwap } from '@extension-base/background/types/types';
import { SoraSubmissionUnknownError } from '@/sora/submission';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), prepare: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));
vi.mock('@extension-base/api/substrate/sora', () => ({ createSwap: vi.fn(), prepareSwapExecution: mocks.prepare }));
vi.mock('@/defi/polkaswapExecutionGuard', () => ({
  validatePolkaswapExecution: () => null,
  validateAuthoritativePolkaswapExecution: () => null,
}));
vi.mock('@/sora', async (original) => {
  const actual = await original<typeof import('@/sora')>();
  return {
    ...actual,
    api: {
      account: { pair: { address: 'public-account', meta: {} } },
      formatAddress: (address: string) => address,
      connected: true,
      swap: { execute: mocks.execute },
      calcStaticNetworkFees: vi.fn(async () => undefined),
      NetworkFee: { [actual.Operation.Swap]: '10000000000000000' },
      assets: { getAccountAsset: vi.fn(async () => ({})) },
    },
  };
});

const request = { amountA: '1', amountB: '2', slippage: 0.5, isExchangeB: false, marketType: 'SMART' } as RequestSwap;
function extension() {
  const state = {
    getAccountAddress: () => 'public-account',
    keyringService: {
      getAllAccounts: () => [{ address: 'public-account', meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } }],
      tonKeyring: { getAccounts: () => [] },
      unlockPair: () => true,
    },
    actionCapabilityService: { isActionEnabled: () => true },
    soraDisclaimerService: { isAccepted: () => true },
    networkService: { networkValues: [{ name: SORA_NETWORK_NAME, active: true }] },
    getSubstrateApiMap: { [SORA_NETWORK_NAME]: { api: { isReady: Promise.resolve(true) } } },
    balanceService: { getAccountBalance: () => [] },
    soraFees: { value: {}, next: vi.fn() },
  };
  return new Extension(state as unknown as State);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({
    maximumSourceAmount: '1',
    swapOptions: { ...request, assetA: { address: 'public-source' }, assetB: { address: 'public-destination' } },
  });
});

describe('SORA swap response boundary', () => {
  it.each([`0x${'ab'.repeat(32)}`, undefined])('preserves uncertain submission with hash %s', async (hash) => {
    mocks.execute.mockRejectedValue(new SoraSubmissionUnknownError(hash));
    const result = await extension().handle('public-test', 'pri(accounts.makeSwap)', request);

    expect(result).toEqual({
      status: false,
      outcome: 'unknown',
      ...(hash ? { transactionHash: hash.slice(2) } : {}),
      errors: [{ message: 'sora_broadcast_ambiguous' }],
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('retains ordinary failure for a confirmed dispatch rejection', async () => {
    mocks.execute.mockRejectedValue(new Error('SORA transaction failed'));
    const result = await extension().handle('public-test', 'pri(accounts.makeSwap)', request);
    expect(result).toMatchObject({ status: false });
    expect(result).not.toHaveProperty('outcome');
  });
});
