import { describe, expect, it, vi } from 'vitest';
import type { Runtime, SoraClient } from '@/sora/client';
import { SoraStaking } from '@/sora/staking';
import { VAL, XOR } from '@/sora/runtime';

const UNIT = 10n ** 18n;
const option = (value: Runtime) => ({ unwrapOr: () => value });
const storage = (value: Runtime = null) => vi.fn(async () => option(value));
const call = (name: string, argCount = 1) =>
  Object.assign(
    vi.fn((...args: unknown[]) => ({ name, args })),
    { meta: { args: Array(argCount).fill({}) } }
  );
const key = (...args: unknown[]) => ({ args });
const exposure = (own: bigint, others: [string, bigint][]) => ({
  own: String(own),
  total: String(own + others.reduce((sum, [, value]) => sum + value, 0n)),
  others: others.map(([who, value]) => ({ who, value: String(value) })),
});
const setup = () => {
  const staking: Runtime = {
    activeEra: storage({ index: 2 }),
    currentEra: storage(2),
    bonded: storage('controller'),
    ledger: storage({
      stash: 'stash',
      active: String(5n * UNIT),
      total: String(8n * UNIT),
      unlocking: [],
      claimedRewards: [],
    }),
    nominators: storage({ targets: ['val'], submittedIn: 1 }),
    payee: vi.fn(async () => ({ type: 'Stash' })),
    minNominatorBond: vi.fn(async () => String(UNIT)),
    slashingSpans: storage(null),
    erasStakersClipped: { entries: vi.fn(async () => []) },
    validators: { entries: vi.fn(async () => []) },
    erasValidatorReward: storage(null),
    erasRewardPoints: vi.fn(async () => ({ total: 100, individual: new Map([['val', 100]]) })),
    erasValidatorPrefs: vi.fn(async () => ({ commission: 100_000_000 })),
  };
  const tx: Runtime = Object.fromEntries(
    ['bondExtra', 'unbond', 'rebond', 'setPayee', 'nominate', 'withdrawUnbonded', 'payoutStakers'].map((name) => [
      name,
      call(name),
    ])
  );
  tx.bond = call('bond', 3);
  tx.setController = call('setController', 1);
  const api: Runtime = {
    query: { staking },
    tx: { staking: tx, utility: { batchAll: call('batchAll') } },
    consts: {
      staking: {
        maxNominations: 16,
        sessionsPerEra: 6,
        bondingDuration: 28,
        maxNominatorRewardedPerValidator: 256,
        historyDepth: 2,
      },
      babe: { expectedBlockTime: 6000, epochDuration: 600 },
    },
    derive: { accounts: { info: vi.fn(async () => ({ identity: null })) } },
    call: { stakingApi: { nominationsQuota: vi.fn(async () => 24) } },
  };
  const pair = { address: 'stash', isLocked: false };
  const client: Runtime = {
    api,
    account: { pair },
    address: 'stash',
    formatAddress: (address: string) => address,
    fee: vi.fn(async () => '123'),
    swap: { getResultFromDexRpc: vi.fn(async () => ({ amount: String(UNIT / 10n), route: [VAL, XOR] })) },
    submit: vi.fn(async (_tx: unknown, expected = client.account.pair) => {
      if (expected !== client.account.pair) throw new Error('Signer changed');
    }),
  };
  return { staking, tx, api, pair, client, adapter: new SoraStaking(client as SoraClient) };
};

describe('wallet-owned staking adapter', () => {
  it('encodes precise bond amounts and uses the same atomic calls for fee and submission', async () => {
    const { adapter, tx, client } = setup();
    const request = {
      value: '9007199254740993.123456789012345678',
      controller: 'controller',
      payee: 'Stash',
      validators: ['val', 'val'],
    };
    await expect(adapter.getBondAndNominateNetworkFee(request)).resolves.toBe('123');
    await adapter.bondAndNominate(request);
    expect(tx.bond).toHaveBeenLastCalledWith('controller', '9007199254740993123456789012345678', 'Stash');
    expect(tx.nominate).toHaveBeenLastCalledWith(['val']);
    expect(client.fee.mock.calls[0][0]).toEqual(client.submit.mock.calls[0][0]);
    expect(client.submit.mock.calls[0][0].name).toBe('batchAll');
  });

  it('supports metadata with two-argument bond, stash controller migration and runtime nomination quota', async () => {
    const { adapter, tx, api } = setup();
    tx.bond = call('bond', 2);
    tx.setController = call('setController', 0);
    delete api.consts.staking.maxNominations;
    await adapter.bondAndNominate({ value: '1', controller: 'stash', payee: 'beneficiary', validators: ['val'] });
    expect(adapter.getMaxNominations()).toBe(24);
    expect(tx.bond).toHaveBeenCalledWith(String(UNIT), { Account: 'beneficiary' });
    await adapter.setController({ address: 'stash' });
    expect(tx.setController).toHaveBeenCalledWith();
    await expect(adapter.setController({ address: 'other' })).rejects.toThrow('stash controller');
    await expect(
      adapter.bondAndNominate({ value: '1', controller: 'other', payee: 'Stash', validators: ['val'] })
    ).rejects.toThrow('stash as its controller');
  });

  it('uses the SORA election metadata limit when StakingApi is not exposed', async () => {
    const { adapter, api, tx } = setup();
    delete api.consts.staking.maxNominations;
    api.call = {};
    api.consts.electionProviderMultiPhase = { minerMaxVotesPerVoter: 24 };
    expect(adapter.getMaxNominations()).toBe(24);
    await adapter.nominate({ validators: ['val'] });
    expect(tx.nominate).toHaveBeenCalledWith(['val']);
    await expect(adapter.getValidatorsInfo()).resolves.toEqual([]);
  });

  it('rejects invalid or sub-precision amounts and empty nominations without signing', async () => {
    const { adapter, client } = setup();
    for (const value of ['-1', 'NaN', 'Infinity', '0', '0.0000000000000000001'])
      await expect(adapter.unbond({ value })).rejects.toThrow();
    await expect(adapter.nominate({ validators: [] })).rejects.toThrow('number of validators');
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('separates matured and pending unlocking without rounding token amounts', async () => {
    const { adapter, staking } = setup();
    staking.ledger = storage({
      stash: 'stash',
      active: String(5n * UNIT),
      total: String(8n * UNIT),
      unlocking: [
        { value: String(UNIT), era: 2 },
        { value: String(2n * UNIT), era: 5 },
      ],
    });
    staking.payee.mockResolvedValue({ isAccount: true, asAccount: 'beneficiary' });
    expect(adapter.getUnbondPeriod()).toBe(7);
    await expect(adapter.getMyStakingInfo('stash')).resolves.toMatchObject({
      activeStake: '5',
      totalStake: '8',
      redeemAmount: '1',
      payee: 'beneficiary',
      controller: 'controller',
      myValidators: ['val'],
      unbond: { sum: '2', unlocking: [{ value: '2', remainingEras: '3', remainingHours: '18', remainingDays: '1' }] },
    });
  });

  it('computes the slashing span witness and preserves the signer across ledger queries', async () => {
    const { adapter, staking, tx, client, pair } = setup();
    staking.slashingSpans = storage({ prior: [2, 4] });
    await adapter.withdrawUnbonded({ value: '1000' });
    expect(tx.withdrawUnbonded).toHaveBeenCalledWith(3);
    expect(client.submit).toHaveBeenCalledWith({ name: 'withdrawUnbonded', args: [3] }, pair);
    staking.slashingSpans.mockImplementation(async () => {
      client.account.pair = { address: 'other' };
      return option(null);
    });
    await expect(adapter.withdrawUnbonded({ value: '1' })).rejects.toThrow('Signer changed');
  });

  it('calculates legacy rewards with validator commission and excludes already claimed eras', async () => {
    const { adapter, staking } = setup();
    staking.erasValidatorReward.mockImplementation(async (era: string) =>
      option(era === '1' ? String(100n * UNIT) : null)
    );
    staking.erasStakersClipped.entries.mockResolvedValue([[key(1, 'val'), exposure(UNIT, [['stash', 3n * UNIT]])]]);
    await expect(adapter.getNominatorsReward('stash')).resolves.toEqual([
      { era: '1', sumRewards: '67.5', validators: [{ address: 'val', value: '67.5' }] },
    ]);
    staking.ledger = storage({ stash: 'val', claimedRewards: [1] });
    await expect(adapter.getNominatorsReward('stash')).resolves.toEqual([]);
  });

  it('aggregates all exposure pages, pays only unclaimed pages and retains legacy era fallback', async () => {
    const { adapter, staking } = setup();
    staking.erasValidatorReward.mockImplementation(async (era: string) =>
      option(era === '1' ? String(100n * UNIT) : null)
    );
    staking.erasStakersOverview = Object.assign(
      storage({ total: String(10n * UNIT), own: String(UNIT), pageCount: 2 }),
      {
        entries: vi.fn(async () => [
          [key(1, 'val'), option({ total: String(10n * UNIT), own: String(UNIT), pageCount: 2 })],
        ]),
      }
    );
    staking.erasStakersPaged = {
      entries: vi.fn(async () => [
        [
          key(1, 'val', 0),
          option({ pageTotal: String(3n * UNIT), others: [{ who: 'stash', value: String(3n * UNIT) }] }),
        ],
        [
          key(1, 'val', 1),
          option({ pageTotal: String(6n * UNIT), others: [{ who: 'other', value: String(6n * UNIT) }] }),
        ],
      ]),
    };
    staking.claimedRewards = vi.fn(async () => [1]);
    expect(adapter.getMaxNominatorRewardedPerValidator()).toBe(0);
    await expect(adapter.getElectedValidators('1')).resolves.toEqual([
      {
        address: 'val',
        total: String(10n * UNIT),
        own: String(UNIT),
        others: [
          { who: 'stash', value: String(3n * UNIT) },
          { who: 'other', value: String(6n * UNIT) },
        ],
      },
    ]);
    await expect(adapter.getNominatorsReward('stash')).resolves.toEqual([
      { era: '1', sumRewards: '27', validators: [{ address: 'val', value: '27' }] },
    ]);
    await expect(adapter.getNominatorsReward('val')).resolves.toEqual([
      { era: '1', sumRewards: '13', validators: [{ address: 'val', value: '13' }] },
    ]);
    staking.erasStakersOverview.entries.mockResolvedValue([]);
    staking.erasStakersPaged.entries.mockResolvedValue([]);
    staking.erasStakersClipped.entries.mockResolvedValue([[key(0, 'legacy'), exposure(UNIT, [['stash', UNIT]])]]);
    expect((await adapter.getElectedValidators('0'))[0].address).toBe('legacy');
  });

  it('keeps recovery payee change and unclaimed payout pages in one atomic batch', async () => {
    const { adapter, staking, tx, client, pair } = setup();
    tx.payoutStakersByPage = call('payoutStakersByPage', 3);
    staking.erasStakersOverview = storage({ pageCount: 3 });
    staking.claimedRewards = vi.fn(async () => [1]);
    const request = { payee: 'Stash', payouts: [{ era: '1', validators: ['val', 'val'] }] };
    await adapter.getPayoutNetworkFee(request);
    await adapter.payout(request);
    const expected = {
      name: 'batchAll',
      args: [
        [
          { name: 'setPayee', args: ['Stash'] },
          { name: 'payoutStakersByPage', args: ['val', '1', 0] },
          { name: 'payoutStakersByPage', args: ['val', '1', 2] },
        ],
      ],
    };
    expect(client.submit).toHaveBeenCalledWith(expected, pair);
    expect(client.fee).toHaveBeenCalledWith(expected);
    staking.claimedRewards.mockResolvedValue([0, 1, 2]);
    await expect(adapter.payout(request)).rejects.toThrow('No claimable');
  });

  it('rejects a payout signer switch while fetching claim state', async () => {
    const { adapter, staking, client } = setup();
    staking.bonded.mockImplementation(async () => {
      client.account.pair = { address: 'other' };
      return option('controller');
    });
    await expect(adapter.payout({ payouts: [{ era: '1', validators: ['val'] }] })).rejects.toThrow('Signer changed');
  });

  it('includes full legacy exposures when checking oversubscribed validators', async () => {
    const { adapter, staking } = setup();
    staking.erasStakers = {
      entries: vi.fn(async () => [
        [
          key(2, 'val'),
          exposure(UNIT, [
            ['a', UNIT],
            ['b', UNIT],
          ]),
        ],
      ]),
    };
    staking.erasStakersClipped.entries.mockResolvedValue([[key(2, 'val'), exposure(UNIT, [['a', UNIT]])]]);
    expect((await adapter.getElectedValidators('2'))[0].others).toHaveLength(2);
  });
  it('projects validator identity, raw stakes, commission and annual reward estimate', async () => {
    const { adapter, staking, api, client } = setup();
    staking.validators.entries.mockResolvedValue([[key('val'), { commission: 100_000_000, blocked: false }]]);
    staking.erasValidatorReward.mockResolvedValue(option(String(UNIT)));
    staking.erasStakersClipped.entries.mockResolvedValue([[key(2, 'val'), exposure(UNIT, [['stash', 3n * UNIT]])]]);
    api.derive.accounts.info.mockResolvedValue({
      identity: { display: 'Validator', web: 'https://example.test', judgements: [[0, { isKnownGood: true }]] },
    });
    const [validator] = await adapter.getValidatorsInfo();
    expect(validator).toMatchObject({
      address: 'val',
      commission: '10',
      rewardPoints: 100,
      stake: { total: String(4n * UNIT), own: String(UNIT) },
      identity: { info: { display: 'Validator', web: 'https://example.test' } },
      isKnownGood: true,
      isOversubscribed: false,
      apy: '3285',
    });
    expect(client.swap.getResultFromDexRpc).toHaveBeenCalledWith(VAL, XOR, '1');
    client.swap.getResultFromDexRpc.mockResolvedValue({ amount: String(2n * UNIT), route: [VAL, XOR] });
    expect((await adapter.getValidatorsInfo())[0].apy).toBe('65700');
  });
  it.each(['0', '-1', 'NaN', '1.2'])('keeps staking recovery data available without a valid reward conversion: %s', async (amount) => {
    const { adapter, client, staking } = setup();
    staking.validators.entries.mockResolvedValue([[key('val'), { commission: 0, blocked: false }]]);
    client.swap.getResultFromDexRpc.mockResolvedValue({ amount, route: [] });
    await expect(adapter.getValidatorsInfo()).resolves.toMatchObject([{ address: 'val', apy: '0' }]);
    await expect(adapter.getMyStakingInfo('stash')).resolves.toMatchObject({ activeStake: '5', totalStake: '8' });
  });
  it('does not publish validator estimates that combine two connections', async () => {
    const { adapter, client, api } = setup();
    client.swap.getResultFromDexRpc.mockImplementation(async () => {
      client.api = { ...api };
      return { amount: String(UNIT), route: [VAL, XOR] };
    });
    await expect(adapter.getValidatorsInfo()).rejects.toThrow('connection changed');
  });
  it('does not assume equal token values if the reward quote fails', async () => {
    const { adapter, client, staking } = setup();
    staking.validators.entries.mockResolvedValue([[key('val'), { commission: 0, blocked: false }]]);
    client.swap.getResultFromDexRpc.mockRejectedValue(new Error('Quote unavailable'));
    await expect(adapter.getValidatorsInfo()).resolves.toMatchObject([{ address: 'val', apy: '0' }]);
  });
  it('rejects reconnects while building a recovery payout batch or withdrawal witness', async () => {
    const payout = setup();
    payout.staking.bonded.mockImplementation(async () => {
      payout.client.api = { ...payout.api };
      return option('controller');
    });
    await expect(
      payout.adapter.payout({ payee: 'Stash', payouts: [{ era: '1', validators: ['val'] }] })
    ).rejects.toThrow('connection changed');
    expect(payout.client.submit).not.toHaveBeenCalled();
    const withdraw = setup();
    withdraw.staking.slashingSpans.mockImplementation(async () => {
      withdraw.client.api = { ...withdraw.api };
      return option(null);
    });
    await expect(withdraw.adapter.withdrawUnbonded({ value: '1' })).rejects.toThrow('connection changed');
    expect(withdraw.client.submit).not.toHaveBeenCalled();
  });
});
