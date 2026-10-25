import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolsService } from '@extension-base/services/pools-service';
import type State from '@extension-base/background/handlers/State';
import type { DemeterMutationRequest, RequestRemoveLiquidity } from '@extension-base/services/pools-service/types';
import { FPNumber } from '@/sora/number';
import { SORA_XOR_ASSET_ID } from '@/consts/sora';

const mocks = vi.hoisted(() => ({ api: {
  account: { pair: { address: 'legacy', meta: {} } },
  formatAddress: (address: string) => address,
  shouldPairBeLocked: true,
  assets: { getAccountAsset: vi.fn() },
  poolXyk: { add: vi.fn(), remove: vi.fn() },
  demeterFarming: { depositLiquidity: vi.fn(), stake: vi.fn(), withdrawLiquidity: vi.fn(), unstake: vi.fn(), getRewards: vi.fn() },
} }));
vi.mock('@/sora', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/sora')>(), api: mocks.api,
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/consts/global')>(), IS_EXTENSION: true,
}));

const asset = (address: string) => ({ address, decimals: 18, balance: { transferable: '1000000000000000000' } });
const withdraw = { operation: 'withdraw', amount: '1', expectedFee: '0.01', pool: {
  key: 'fixture', isFarm: false, baseAssetId: 'base', poolAssetId: 'pool', rewardAssetId: 'reward',
} } as DemeterMutationRequest;
const liquidity = { amount1: '1', amount2: '1', slippage: 0.5, isExchangeB: false } as RequestRemoveLiquidity;

function setup() {
  let selected = 'legacy';
  const state = {
    getAccountAddress: () => selected,
    keyringService: { getAllAccounts: () => [
      { address: 'legacy', meta: {} }, { address: 'fresh', meta: { walletSecurityGeneration: 1 } },
    ], unlockPair: vi.fn().mockReturnValue(true) },
    actionCapabilityService: { isActionEnabled: () => true },
    soraDisclaimerService: { isAccepted: () => true },
  } as unknown as State;
  const service = new PoolsService(state);
  Object.assign(service, {
    isSoraRuntimeReady: vi.fn().mockResolvedValue(true),
    refreshSoraFee: vi.fn().mockResolvedValue(new FPNumber('0.01')),
    getAuthoritativeDemeterPool: vi.fn().mockResolvedValue({ isRemoved: false }),
    getAuthoritativeDemeterPositions: vi.fn().mockResolvedValue([{ pooledTokens: new FPNumber('2'), rewards: new FPNumber('1') }]),
    getDemeterPoolKey: () => 'fixture',
    getDemeterAsset: asset,
    prepareLiquidityMutation: vi.fn(async () => ({ ok: true, value: {
      signingContext: { pair: mocks.api.account.pair, selectedAddress: selected },
      asset1: asset('one'), asset2: asset('two'), xorAsset: asset(SORA_XOR_ASSET_ID), fee: new FPNumber('0.01'),
      reserves: ['100000000000000000000', '100000000000000000000'],
      totalSupply: '10000000000000000000', poolBalance: '5000000000000000000',
    } })),
  });
  return { service, select: (address: string) => { selected = address; } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.account = { pair: { address: 'legacy', meta: {} } };
  mocks.api.shouldPairBeLocked = true;
  mocks.api.assets.getAccountAsset.mockImplementation(async (address: string) => asset(address));
});

describe('legacy pool and farming recovery mutations', () => {
  it('withdraws existing liquidity without permitting a new deposit', async () => {
    const { service } = setup();
    await expect(service.removeLiquidity(liquidity)).resolves.toEqual({ status: true });
    expect(mocks.api.poolXyk.remove).toHaveBeenCalledOnce();
    await expect(service.addLiquidity(liquidity)).rejects.toThrow('recovery-only');
    expect(mocks.api.poolXyk.add).not.toHaveBeenCalled();
  });

  it.each([false, true])('permits Demeter exits and claims for isFarm=%s while blocking deposits', async (isFarm) => {
    const { service } = setup();
    const request = { ...withdraw, pool: { ...withdraw.pool, isFarm } };
    await expect(service.mutateDemeter(request)).resolves.toEqual({ status: true });
    expect(isFarm ? mocks.api.demeterFarming.withdrawLiquidity : mocks.api.demeterFarming.unstake).toHaveBeenCalledOnce();
    await expect(service.mutateDemeter({ ...request, operation: 'claim' })).resolves.toEqual({ status: true });
    expect(mocks.api.demeterFarming.getRewards).toHaveBeenCalledOnce();
    await expect(service.mutateDemeter({ ...request, operation: 'deposit' })).rejects.toThrow('recovery-only');
    expect(mocks.api.demeterFarming.depositLiquidity).not.toHaveBeenCalled();
    expect(mocks.api.demeterFarming.stake).not.toHaveBeenCalled();
  });

  it('does not permit a withdrawal beyond the deposited Demeter position', async () => {
    await expect(setup().service.mutateDemeter({ ...withdraw, amount: '3' })).resolves.toMatchObject({
      status: false, errors: [expect.objectContaining({ message: 'The amount exceeds the deposited position.' })],
    });
    expect(mocks.api.demeterFarming.unstake).not.toHaveBeenCalled();
  });

  it('does not submit an allowed exit if the selected account changes while waiting', async () => {
    const { service, select } = setup();
    Object.assign(service, { isSoraRuntimeReady: vi.fn(async () => {
      select('fresh');
      mocks.api.account = { pair: { address: 'fresh', meta: {} } };
      return true;
    }) });
    await expect(service.removeLiquidity(liquidity)).resolves.toMatchObject({ status: false });
    expect(mocks.api.poolXyk.remove).not.toHaveBeenCalled();
  });
});
