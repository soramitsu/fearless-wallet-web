import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAddress } from '@polkadot/util-crypto';
import { StakingService } from '@extension-base/services/staking-service';
import type State from '@extension-base/background/handlers/State';
import type { MakeStakingRequest } from '@extension-base/services/staking-service/types';
import { SoraSubmissionUnknownError } from '@/sora/submission';

const mocks = vi.hoisted(() => ({
  api: {
    account: { pair: { address: 'fresh', meta: { walletSecurityGeneration: 1 } } },
    formatAddress: (address: string) => address,
    shouldPairBeLocked: true,
    staking: {
      bondExtra: vi.fn(), unbond: vi.fn(), withdrawUnbonded: vi.fn(), payout: vi.fn(), getPayoutNetworkFee: vi.fn(),
      getStashByController: vi.fn(), getMyStakingInfo: vi.fn(), getEraHours: vi.fn(),
    },
  },
}));
vi.mock('@/sora', () => ({
  api: mocks.api, FPNumber: { fromCodecValue: (value: string) => ({ toString: () => value }) },
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/consts/global')>(), IS_EXTENSION: true,
}));
vi.mock('@extension-base/stores/Storage', () => ({ storage: {} }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ getUtilityProps: () => ({ precision: 18 }) }));
vi.mock('@/helpers/staking', () => ({}));
vi.mock('@/helpers', () => ({}));

const request = {
  type: 'bondExtra', params: { from: 'fresh', networkName: 'sora', amount: '1' },
} as MakeStakingRequest;

function setup(ready: Promise<unknown> = Promise.resolve(true)) {
  let selected = 'fresh';
  const accounts = [
    { address: 'fresh', meta: { walletSecurityGeneration: 1 } },
    { address: 'old', meta: {} },
  ];
  const state = {
    getAccountAddress: () => selected,
    keyringService: { getAllAccounts: () => accounts },
    getSubstrateApiMap: { sora: { api: { isReady: ready } } },
  } as unknown as State;
  return { service: new StakingService(state), select: (address: string) => { selected = address; } };
}

beforeEach(() => {
  mocks.api.account = { pair: { address: 'fresh', meta: { walletSecurityGeneration: 1 } } };
  mocks.api.shouldPairBeLocked = true;
  mocks.api.staking.bondExtra.mockReset().mockResolvedValue(undefined);
  mocks.api.staking.unbond.mockReset().mockResolvedValue(undefined);
  mocks.api.staking.withdrawUnbonded.mockReset().mockResolvedValue(undefined);
  mocks.api.staking.payout.mockReset().mockResolvedValue(undefined);
  mocks.api.staking.getPayoutNetworkFee.mockReset().mockResolvedValue('0.02');
  mocks.api.staking.getStashByController.mockReset().mockResolvedValue('old-stash');
  mocks.api.staking.getEraHours.mockReset().mockReturnValue(6);
  mocks.api.staking.getMyStakingInfo.mockReset().mockResolvedValue({ payee: 'Stash', controller: 'separate-controller' });
});

describe('staking actual signer recovery policy', () => {
  it('keeps recoverable stake and a finite default APY when no validator estimate is available', async () => {
    const { service } = setup();
    vi.spyOn(service, 'getValidators').mockResolvedValue([{ address: 'validator', apy: '0' }] as never);
    vi.spyOn(service, 'getMinNominatorBond').mockResolvedValue(1);
    vi.spyOn(service, 'getMyStakingInfo').mockResolvedValue({ activeStake: '5', redeemAmount: '2' } as never);
    vi.spyOn(service, 'getUnbondPeriod').mockReturnValue(7);
    vi.spyOn(service, 'getMaxNominations').mockReturnValue(16);
    vi.spyOn(service, 'maxNominatorRewardedPerValidator').mockReturnValue(256);
    await expect(service.getStakingParams({ networks: ['sora'] })).resolves.toMatchObject([
      { network: 'sora', activeStake: '5', redeemAmount: '2', apy: 0, eraHours: 6 },
    ]);
  });

  it('uses the fresh selected SDK signer for normal staking', async () => {
    await expect(setup().service.makeStaking(request)).resolves.toEqual({ status: true });
    expect(mocks.api.staking.bondExtra).toHaveBeenCalledExactlyOnceWith({ value: '1' });
  });

  it('rejects a legacy selected wallet even when from names a fresh wallet', async () => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    await expect(service.makeStaking(request)).rejects.toThrow('recovery-only');
    expect(mocks.api.staking.bondExtra).not.toHaveBeenCalled();
  });

  it('rejects a stale SDK signer before it can sign for another selected wallet', async () => {
    mocks.api.account.pair.address = 'old';
    await expect(setup().service.makeStaking(request)).rejects.toThrow('staking account changed');
    expect(mocks.api.staking.bondExtra).not.toHaveBeenCalled();
  });

  it('rechecks the selected account after waiting for runtime readiness', async () => {
    let ready!: (value: unknown) => void;
    const { service, select } = setup(new Promise((resolve) => { ready = resolve; }));
    const pending = service.makeStaking(request);
    select('old');
    mocks.api.account = { pair: { address: 'old', meta: { walletSecurityGeneration: 0 } } };
    ready(true);
    await expect(pending).rejects.toThrow('recovery-only');
    expect(mocks.api.staking.bondExtra).not.toHaveBeenCalled();
    expect(mocks.api.shouldPairBeLocked).toBe(true);
  });

  it('rejects replacement of the SDK pair while waiting even if its address is unchanged', async () => {
    let ready!: (value: unknown) => void;
    const { service } = setup(new Promise((resolve) => { ready = resolve; }));
    const pending = service.makeStaking(request);
    mocks.api.account = { pair: { address: 'fresh', meta: { walletSecurityGeneration: 1 } } };
    ready(true);
    await expect(pending).rejects.toThrow('staking account changed');
    expect(mocks.api.staking.bondExtra).not.toHaveBeenCalled();
  });

  it.each([
    ['unbond', 'unbond'], ['redeem', 'withdrawUnbonded'],
  ] as const)('allows legacy %s with the bound signer', async (type, sdkMethod) => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    await expect(service.makeStaking({ ...request, type, params: { ...request.params, from: 'old' } })).resolves.toEqual({ status: true });
    expect(mocks.api.staking[sdkMethod]).toHaveBeenCalledExactlyOnceWith({ value: '1' });
  });

  it('claims legacy rewards to the free stash balance and estimates the same atomic payout', async () => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    const payouts = [{ era: '12', validators: ['validator'] }];
    await expect(service.getPayoutsFee({ payouts, network: 'sora' })).resolves.toBe('0.02');
    await expect(service.makeStaking({ type: 'payoutRewards', params: {
      from: 'old', networkName: 'sora', payouts,
    } } as MakeStakingRequest)).resolves.toEqual({ status: true });
    expect(mocks.api.staking.payout).toHaveBeenCalledExactlyOnceWith({ payouts, payee: 'Stash' });
    expect(mocks.api.staking.getPayoutNetworkFee).toHaveBeenCalledExactlyOnceWith({ payouts, payee: 'Stash' });
  });

  it('preserves a fresh wallet reward destination', async () => {
    const { service } = setup();
    const payouts = [{ era: '12', validators: ['validator'] }];
    await service.makeStaking({ type: 'payoutRewards', params: { from: 'fresh', networkName: 'sora', payouts } } as MakeStakingRequest);
    expect(mocks.api.staking.payout).toHaveBeenCalledExactlyOnceWith({ payouts });
    expect(mocks.api.staking.getStashByController).not.toHaveBeenCalled();
  });

  it.each([
    ['Stash', 'separate-controller'],
    ['Controller', 'separate-controller'],
    [encodeAddress(new Uint8Array(32).fill(7)), 'separate-controller'],
    [encodeAddress(new Uint8Array(32).fill(7)), ''],
  ])('claims directly to existing noncompounding payee %s when selected wallet has no controller ledger', async (payee, controller) => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    mocks.api.staking.getStashByController.mockResolvedValue('');
    mocks.api.staking.getMyStakingInfo.mockResolvedValue({ payee, controller });
    const payouts = [{ era: '12', validators: ['validator'] }];
    await expect(service.getPayoutsFee({ payouts, network: 'sora' })).resolves.toBe('0.02');
    await expect(service.makeStaking({ type: 'payoutRewards', params: {
      from: 'old', networkName: 'sora', payouts,
    } } as MakeStakingRequest)).resolves.toEqual({ status: true });
    expect(mocks.api.staking.payout).toHaveBeenCalledExactlyOnceWith({ payouts });
    expect(mocks.api.staking.getPayoutNetworkFee).toHaveBeenCalledExactlyOnceWith({ payouts });
  });

  it.each([
    ['Staked', 'separate-controller', 'Select the staking controller wallet'],
    ['', '', 'no payable reward destination'],
    ['None', '', 'no payable reward destination'],
    ['Controller', '', 'no payable reward destination'],
    ['unknown-destination', '', 'no payable reward destination'],
  ])('refuses an unsafe or nonpayable legacy destination %s before fee estimation or signing', async (payee, controller, message) => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    mocks.api.staking.getStashByController.mockResolvedValue('');
    mocks.api.staking.getMyStakingInfo.mockResolvedValue({ payee, controller });
    const payouts = [{ era: '12', validators: ['validator'] }];
    await expect(service.getPayoutsFee({ payouts, network: 'sora' })).rejects.toThrow(message);
    const result = await service.makeStaking({ type: 'payoutRewards', params: {
      from: 'old', networkName: 'sora', payouts,
    } } as MakeStakingRequest);
    expect(result.status).toBe(false);
    expect(result.errors?.[0].message).toContain(message);
    expect(mocks.api.staking.payout).not.toHaveBeenCalled();
    expect(mocks.api.staking.getPayoutNetworkFee).not.toHaveBeenCalled();
  });

  it('rechecks the actual signer after resolving live payout destination', async () => {
    const { service, select } = setup();
    select('old');
    mocks.api.account.pair.address = 'old';
    mocks.api.staking.getStashByController.mockResolvedValue('');
    let started!: () => void;
    const lookupStarted = new Promise<void>((resolve) => { started = resolve; });
    let complete!: (value: unknown) => void;
    const lookup = new Promise((resolve) => { complete = resolve; });
    mocks.api.staking.getMyStakingInfo.mockImplementation(() => { started(); return lookup; });
    const pending = service.makeStaking({ type: 'payoutRewards', params: {
      from: 'old', networkName: 'sora', payouts: [{ era: '12', validators: ['validator'] }],
    } } as MakeStakingRequest);
    await lookupStarted;
    select('fresh');
    mocks.api.account = { pair: { address: 'fresh', meta: { walletSecurityGeneration: 1 } } };
    complete({ payee: 'Stash', controller: 'separate-controller' });
    const result = await pending;
    expect(result.status).toBe(false);
    expect(result.errors?.[0].message).toContain('staking account changed');
    expect(mocks.api.staking.payout).not.toHaveBeenCalled();
  });

  it('rejects a stale payout fee when the selected account changes during destination lookup', async () => {
    const { service, select } = setup();
    select('old');
    let complete!: (value: unknown) => void;
    mocks.api.staking.getStashByController.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const pending = service.getPayoutsFee({ payouts: [{ era: '12', validators: ['validator'] }], network: 'sora' });
    select('fresh');
    complete('old-stash');
    await expect(pending).rejects.toThrow('staking account changed');
    expect(mocks.api.staking.getPayoutNetworkFee).not.toHaveBeenCalled();
  });

  it('still rejects account changes during an allowed recovery exit', async () => {
    let ready!: (value: unknown) => void;
    const { service, select } = setup(new Promise((resolve) => { ready = resolve; }));
    select('old');
    mocks.api.account.pair.address = 'old';
    const pending = service.makeStaking({ ...request, type: 'unbond', params: { ...request.params, from: 'old' } });
    select('fresh');
    mocks.api.account = { pair: { address: 'fresh', meta: { walletSecurityGeneration: 1 } } };
    ready(true);
    await expect(pending).rejects.toThrow('staking account changed');
    expect(mocks.api.staking.unbond).not.toHaveBeenCalled();
  });
});


describe('SORA staking submission uncertainty', () => {
  it.each([
    ['bondExtra', 'bondExtra'], ['unbond', 'unbond'], ['redeem', 'withdrawUnbonded'], ['payoutRewards', 'payout'],
  ] as const)('preserves the unknown outcome for %s', async (type, method) => {
    const hash = 'ab'.repeat(32);
    mocks.api.staking[method].mockRejectedValue(new SoraSubmissionUnknownError(hash));
    await expect(setup().service.makeStaking({ ...request, type })).resolves.toEqual({
      status: false, outcome: 'unknown', transactionHash: hash, errors: [{ message: 'sora_broadcast_ambiguous' }],
    });
    expect(mocks.api.staking[method]).toHaveBeenCalledOnce();
  });
});
