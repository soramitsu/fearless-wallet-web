import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { SoraClient, XOR, type Runtime } from '@/sora/client';

const POOL = `0x${'03'.repeat(32)}`;
const REWARD = `0x${'04'.repeat(32)}`;
const units = (value: number, precision: number) => String(BigInt(value) * 10n ** BigInt(precision));

function fixture(poolPrecision = 6, rewardPrecision = 8) {
  const client = new SoraClient();
  client.account = { json: null, pair: { address: `0x${'01'.repeat(32)}` } as Runtime };
  const accountRows = [false, true].map((isFarm) => ({
    baseAsset: XOR, poolAsset: POOL, rewardAsset: REWARD, isFarm,
    pooledTokens: units(2, isFarm ? 18 : poolPrecision), rewards: units(3, rewardPrecision),
  }));
  const poolRows = accountRows.map((row) => ({
    ...row, multiplier: 2, isCore: false, isRemoved: false,
    depositFee: '10000000000000000', totalTokensInPool: row.pooledTokens,
    rewardsToBeDistributed: units(4, rewardPrecision),
  }));
  const stop = vi.fn();
  const pools = Object.assign(vi.fn(async (_pool, _reward, cb) => { cb(poolRows); return stop; }), {
    keys: async () => [{ args: [POOL, REWARD] }],
  });
  const tokenInfos = Object.assign(vi.fn(async (_asset, cb) => {
    cb({ unwrapOr: () => ({
      tokenPerBlock: units(5, rewardPrecision), farmsTotalMultiplier: 2, stakingTotalMultiplier: 3,
      farmsAllocation: '500000000000000000', stakingAllocation: '250000000000000000',
      teamAllocation: '250000000000000000',
    }) });
    return stop;
  }), { keys: async () => [{ args: [REWARD] }] });
  client.api = {
    query: {
      assets: { assetInfos: vi.fn(async (address: string) => ({ toHuman: () =>
        [address === POOL ? 'POOL' : 'REWARD', 'Token', address === POOL ? poolPrecision : rewardPrecision, false],
      })) },
      demeterFarmingPlatform: {
        userInfos: vi.fn(async (_address, cb) => { cb(accountRows); return stop; }), pools, tokenInfos,
      },
    },
    tx: { demeterFarmingPlatform: { deposit: vi.fn(() => ({})), withdraw: vi.fn(() => ({})) } },
  };
  vi.spyOn(client, 'submit').mockResolvedValue();
  const poolAsset = { address: POOL, decimals: poolPrecision, symbol: 'POOL', name: 'Pool token', isMintable: false };
  const rewardAsset = { ...poolAsset, address: REWARD, decimals: rewardPrecision };
  return { client, poolAsset, rewardAsset };
}

describe('Demeter amounts preserve their asset units', () => {
  it('rejects a position if the selected account changes while its asset precision loads', async () => {
    const { client } = fixture();
    const pending = firstValueFrom(client.demeterFarming.getAccountPoolsObservable());
    client.account = { json: null, pair: { address: `0x${'02'.repeat(32)}` } as Runtime };
    await expect(pending).rejects.toThrow('SORA account changed');
  });

  it.each([0, 6, 18])('decodes a %i-decimal stake and encodes its entire position for withdrawal', async (precision) => {
    const { client, poolAsset, rewardAsset } = fixture(precision);
    const [stake, farm] = await firstValueFrom(client.demeterFarming.getAccountPoolsObservable());
    expect(stake.pooledTokens.toString()).toBe('2');
    expect(stake.rewards.toString()).toBe('3');
    expect(farm.pooledTokens.toString()).toBe('2');
    expect(farm.rewards.toString()).toBe('3');
    await client.demeterFarming.unstake(poolAsset, rewardAsset, stake.pooledTokens.toString());
    expect(client.api.tx.demeterFarmingPlatform.withdraw).toHaveBeenCalledWith(
      POOL, POOL, REWARD, units(2, precision), false,
    );
    await client.demeterFarming.withdrawLiquidity(farm.pooledTokens.toString(), poolAsset, rewardAsset, { ...poolAsset, address: XOR });
    expect(client.api.tx.demeterFarmingPlatform.withdraw).toHaveBeenLastCalledWith(
      XOR, POOL, REWARD, units(2, 18), true,
    );
  });

  it.each([0, 6, 18])('scales %i-decimal pool totals independently from LP units, rewards and deposit rates', async (precision) => {
    const { client } = fixture(precision, 8);
    const pools = await firstValueFrom(await client.demeterFarming.getPoolsObservable());
    for (const pool of pools) {
      expect(pool.totalTokensInPool.toString()).toBe('2');
      expect(pool.rewards.toString()).toBe('3');
      expect(pool.rewardsToBeDistributed.toString()).toBe('4');
      expect(pool.depositFee).toBe(0.01);
    }
  });

  it.each([0, 8, 18])('scales %i-decimal reward emissions without rescaling allocation rates', async (precision) => {
    const { client } = fixture(6, precision);
    const [token] = await firstValueFrom(await client.demeterFarming.getTokenInfosObservable());
    expect(token.tokenPerBlock.toString()).toBe('5');
    expect(token.farmsAllocation.toString()).toBe('0.5');
    expect(token.stakingAllocation.toString()).toBe('0.25');
    expect(token.teamAllocation.toString()).toBe('0.25');
  });
});
