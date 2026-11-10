import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StakingService } from '@extension-base/services/staking-service';
import { TransferErrorCode } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { SoraSubmissionUnknownError } from '@/sora/submission';
const boundary = vi.hoisted(() => ({ staking: {} as Record<string, ReturnType<typeof vi.fn>>, storage: vi.fn() }));
vi.mock('@/sora', async () => ({ FPNumber: (await import('@/sora/number')).FPNumber, api: { staking: boundary.staking, formatAddress: (value: string) => value } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: boundary.storage } }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ getUtilityProps: () => ({ precision: 3 }) }));
const operations = [
  ['bondAndNominate', 'bondAndNominate', { amount: '2', from: 'alice', payoutAddress: '', validators: ['v1'] }, { value: '2', controller: 'alice', payee: 'alice', validators: ['v1'] }, TransferErrorCode.BOND_ERROR],
  ['bondExtra', 'bondExtra', { amount: '2' }, { value: '2' }, TransferErrorCode.BONDEXTRA_ERROR],
  ['unbond', 'unbond', { amount: '2' }, { value: '2' }, TransferErrorCode.UNBOND_ERROR],
  ['rebond', 'rebond', { amount: '2' }, { value: '2' }, TransferErrorCode.REBOND_ERROR],
  ['withdrawUnbonded', 'withdrawUnbonded', { amount: '2' }, { value: '2' }, TransferErrorCode.REDEEM_ERROR],
  ['setControllerAccount', 'setController', { controllerAddress: 'bob' }, { address: 'bob' }, TransferErrorCode.SET_CONTROLLER_ERROR],
  ['nominate', 'nominate', { validators: ['v1'] }, { validators: ['v1'] }, TransferErrorCode.NOMINATE_ERROR],
  ['setPayee', 'setPayee', { payee: 'bob' }, { payee: 'bob' }, TransferErrorCode.SET_PAYEE_ERROR],
] as const;
let service: StakingService;
beforeEach(() => {
  for (const name of [...operations.map(row => row[1]), 'getStashByController', 'getMyStakingInfo', 'getCurrentEra', 'getNominations', 'getElectedValidators', 'getNominatorsReward', 'getValidatorsInfo', 'getMinNominatorBond', 'getMaxNominations', 'getEraHours', 'getUnbondPeriod', 'getMaxNominatorRewardedPerValidator', 'getNominateNetworkFee', 'getBondAndNominateNetworkFee']) boundary.staking[name] = vi.fn();
  boundary.staking.getStashByController.mockResolvedValue(''); boundary.staking.getCurrentEra.mockResolvedValue(12); boundary.staking.getNominations.mockResolvedValue({ submittedIn: 11 });
  boundary.staking.getElectedValidators.mockResolvedValue([]); boundary.staking.getMaxNominatorRewardedPerValidator.mockReturnValue(2); boundary.staking.getMinNominatorBond.mockResolvedValue(1);
  boundary.storage.mockReset().mockResolvedValue({ addressBook: { sora: [{ address: 'controller', name: 'Contact controller' }, { address: 'payee', name: 'Contact payee' }] } });
  service = new StakingService({ getCurrentAddress: () => 'alice', formatAddress: ({ address }: { address: string }) => address, isSameAddress: (a: { address: string }, b: { address: string }) => a.address === b.address,
    keyringService: { getAccountName: (address: string) => address === 'alice' ? 'Alice' : undefined, getSubstrateAddress: (address: string) => address, getEthereumAddress: () => '' }, getSubstrateApiMap: {},
  } as unknown as State);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('staking operation outcomes', () => {
  for (const [method, sdkMethod, params, expected, code] of operations) {
    it(`${method} forwards the approved payload`, async () => {
      await expect(service[method](params as never)).resolves.toEqual({ status: true });
      expect(boundary.staking[sdkMethod]).toHaveBeenCalledExactlyOnceWith(expected);
    });
    it(`${method} reports a rejected operation with its own error code`, async () => {
      boundary.staking[sdkMethod].mockRejectedValueOnce(new Error('dispatch rejected'));
      await expect(service[method](params as never)).resolves.toMatchObject({ status: false, errors: [{ code, message: expect.stringContaining('dispatch rejected') }] });
    });
    it(`${method} preserves an unknown broadcast outcome rather than inviting a blind retry`, async () => {
      boundary.staking[sdkMethod].mockRejectedValueOnce(new SoraSubmissionUnknownError('0x' + 'ab'.repeat(32)));
      await expect(service[method](params as never)).resolves.toEqual({ status: false, outcome: 'unknown', transactionHash: 'ab'.repeat(32), errors: [{ message: 'sora_broadcast_ambiguous' }] });
    });
  }
  it('preserves an explicitly selected payout recipient', async () => {
    await service.bondAndNominate({ amount: '2', from: 'alice', payoutAddress: 'payee', validators: ['v1'] } as never);
    expect(boundary.staking.bondAndNominate).toHaveBeenCalledWith(expect.objectContaining({ payee: 'payee' }));
  });
  it('converts runtime fees at the chain precision and retains controller and validator arguments', async () => {
    boundary.staking.getNominateNetworkFee.mockResolvedValue('125'); boundary.staking.getBondAndNominateNetworkFee.mockResolvedValue('250');
    expect(await service.getNominateNetworkFee({ network: 'sora', validators: ['v1'] })).toBe('0.125');
    expect(await service.getBondAndNominateNetworkFee({ networkName: 'sora', from: 'alice', payoutAddress: 'payee', amount: '2', validators: ['v1'], isMobile: false })).toBe('0.25');
    expect(boundary.staking.getBondAndNominateNetworkFee).toHaveBeenCalledWith({ validators: ['v1'], controller: 'alice', payee: 'payee', value: '2' });
  });
});

describe('validator and reward data', () => {
  it('formats validator identity, fallback labels and codec stakes', async () => {
    boundary.staking.getValidatorsInfo.mockResolvedValue([
      { address: 'v1', identity: { info: { display: 'Validator one', twitter: '@one' } }, stake: { total: '12345', own: '1000' } },
      { address: 'v2', identity: { info: { legal: 'Validator two', web: 'https://two.example' } }, stake: { total: '2345' } },
      { address: 'v3', stake: { total: '0' } },
    ]);
    const validators = await service.getValidators('sora');
    expect(validators[0]).toMatchObject({ name: 'Validator one', description: '@one', stake: { total: '12.345', own: '1' } });
    expect(validators[1]).toMatchObject({ name: 'Validator two', description: 'https://two.example' });
    expect(validators[2].description).toBe('no validator info'); expect(validators[2].name).toBeTruthy();
    expect(service.getValidatorsInformation(['v2'], validators)).toEqual([validators[1]]);
  });
  it('returns safe defaults when a requested runtime is unavailable', async () => {
    const [params] = await service.getStakingParams({ networks: ['missing'] });
    expect(params).toMatchObject({ network: 'missing', apy: 0, minBond: 0, validators: [], activeStake: '0' });
    expect(boundary.staking.getValidatorsInfo).not.toHaveBeenCalled();
  });
  it('sums rewards exactly across eras and preserves each payout validator', async () => {
    boundary.staking.getNominatorsReward.mockResolvedValue([{ era: '10', validators: [{ address: 'v1', value: '0.1' }, { address: 'v2', value: '0.2' }] }, { era: '11', validators: [{ address: 'v1', value: '0.3' }] }]);
    boundary.staking.getValidatorsInfo.mockResolvedValue([{ address: 'v1', stake: {} }, { address: 'v2', stake: {} }]);
    expect(await service.getRewards({ address: 'alice', network: 'sora' })).toMatchObject({ sum: '0.6', payouts: [{ era: '10', validators: ['v1','v2'] }, { era: '11', validators: ['v1'] }], validators: [{ address: 'v1', rewards: '0.4' }, { address: 'v2', rewards: '0.2' }] });
    boundary.staking.getNominatorsReward.mockResolvedValue([]);
    expect(await service.getRewards({ address: 'alice', network: 'sora' })).toMatchObject({ sum: '0', payouts: [], validators: [] });
  });
  it('separates active, waiting, inactive and oversubscribed nominations', async () => {
    boundary.staking.getElectedValidators.mockResolvedValue([
      { address: 'active', total: '100', others: [{ who: 'alice', value: '10' }] },
      { address: 'waiting', total: '0', others: [] },
      { address: 'inactive', total: '100', others: [{ who: 'other', value: '100' }] },
      { address: 'crowded', total: '100', others: [{ who: 'alice', value: '1' }, { who: 'other1', value: '10' }, { who: 'other2', value: '20' }] },
    ]);
    expect(await service.getValidatorsStatuses('alice', 'sora', ['active','waiting','inactive','crowded'])).toEqual({ validatorsActive: ['active'], validatorsWaiting: ['waiting'], validatorsInactive: ['inactive'], validatorsOversubscribed: ['crowded'] });
  });
  it('never calls a nominee absent from the elected set active', async () => {
    expect(await service.getValidatorsStatuses('alice', 'sora', ['unelected'])).toMatchObject({ validatorsActive: [], validatorsInactive: ['unelected'] });
    boundary.staking.getNominations.mockResolvedValue({ submittedIn: 12 });
    expect(await service.getValidatorsStatuses('alice', 'sora', ['unelected'])).toMatchObject({ validatorsActive: [], validatorsWaiting: ['unelected'] });
  });
  it('uses the runtime minimum when validators or nominator positions are absent', async () => {
    expect(await service.getMinNominatorBond([], 'sora')).toBe(1);
    expect(await service.getMinNominatorBond([{ isOversubscribed: true, nominators: [] }] as never, 'sora')).toBe(1);
    expect(await service.getMinNominatorBond([{ isOversubscribed: false, nominators: [] }] as never, 'sora')).toBe(1);
    expect(await service.getMinNominatorBond([{ isOversubscribed: true, nominators: [{ value: '1000' }] }, { isOversubscribed: true, nominators: [{ value: '2000' }] }] as never, 'sora')).toBe(1.001);
  });
  it('resolves stash, controller and payee names and emits exact validator statuses', async () => {
    boundary.staking.getStashByController.mockResolvedValue('alice');
    boundary.staking.getMyStakingInfo.mockResolvedValue({ controller: 'controller', payee: 'payee', myValidators: ['v1'], totalStake: '10', redeemAmount: '0' });
    vi.spyOn(service, 'getValidatorsStatuses').mockResolvedValue({ validatorsActive: [], validatorsInactive: [], validatorsWaiting: [], validatorsOversubscribed: ['v1'] });
    const info = await service.getMyStakingInfo('sora', [{ address: 'v1' }] as never, 1);
    expect(info).toMatchObject({ stashAddress: 'alice', stashName: 'Alice', controllerName: 'Contact controller', payeeName: 'Contact payee', isOtherController: true, isOtherPayee: true, myValidators: [{ address: 'v1', status: 'oversubscribed', isOversubscribed: true }] });
  });
  it.each(['Stash', 'Staked', 'Controller'])('resolves controller-owned %s payout names to the actual wallet', async payee => {
    boundary.staking.getStashByController.mockResolvedValue('stash');
    boundary.staking.getMyStakingInfo.mockResolvedValue({ controller: 'alice', payee, myValidators: [], totalStake: '10', redeemAmount: '0' });
    const info = await service.getMyStakingInfo('sora', [], 1);
    expect(info.isController).toBe(true); expect(info.payeeAddress).toBe(payee === 'Controller' ? 'alice' : 'stash');
    expect(info.controllerName).toBe('Alice');
  });
  it.each([
    [{ redeemAmount: '2', totalStake: '0', myValidators: [] }, ['redeem','bondMoreTokens','emptyValidators']],
    [{ redeemAmount: '0', totalStake: '10', myValidators: [{ isActive: false, isWaiting: false }] }, ['emptyElectedValidators']],
    [{ redeemAmount: '0', totalStake: '10', myValidators: [{ isWaiting: true }] }, ['waitingForNextEra']],
    [{ redeemAmount: '0', totalStake: '10', myValidators: [{ isActive: true }] }, []],
  ])('shows only actionable alerts for %s', (info, names) => {
    expect(service.getALerts(info as never, 1).map(alert => alert.name)).toEqual(names);
  });
});
