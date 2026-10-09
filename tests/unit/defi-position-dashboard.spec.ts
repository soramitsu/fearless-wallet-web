import { describe, expect, it, vi } from 'vitest';
import type { DemeterPoolsResponse, PoolsParamsResponse } from '@extension-base/services/pools-service/types';
import type { StakingParamsResponse } from '@extension-base/services/staking-service/types';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';
import { loadPositionDashboard } from '@/defi/positionDashboard';

const emptyMarkets = {
  positions: [],
  claimable: [],
  markets: [],
  collateral: 'KUSD',
  indexerStale: false,
} as unknown as PolkamarktSnapshot;
const sources = () => ({
  staking: vi.fn<() => Promise<StakingParamsResponse>>().mockResolvedValue([]),
  stakingSymbol: () => 'XOR',
  pools: vi.fn<() => Promise<PoolsParamsResponse>>().mockResolvedValue([]),
  farming: vi
    .fn<() => Promise<DemeterPoolsResponse>>()
    .mockResolvedValue({ available: true, pools: [] } as unknown as DemeterPoolsResponse),
  markets: vi.fn<() => Promise<PolkamarktSnapshot>>().mockResolvedValue(emptyMarkets),
});

describe('position dashboard', () => {
  it('only reports an empty wallet after all providers answer successfully', async () => {
    await expect(loadPositionDashboard(sources())).resolves.toEqual({ rows: [], status: 'ready' });
    const partial = sources();
    partial.staking.mockRejectedValue(new Error('offline'));
    await expect(loadPositionDashboard(partial)).resolves.toEqual({ rows: [], status: 'partial' });
  });

  it('preserves funded rows and units when another provider fails', async () => {
    const request = sources();
    request.staking.mockResolvedValue([
      { network: 'sora mainnet', totalStake: '5.25' },
      { network: 'sora test', totalStake: '0' },
    ] as StakingParamsResponse);
    request.farming.mockRejectedValue(new Error('offline'));
    const result = await loadPositionDashboard(request);
    expect(result.status).toBe('partial');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].values).toEqual([{ label: 'ux.staking', value: '5.25 XOR' }]);
    expect(result.rows[0].route).toEqual({ name: 'MyStake', params: { network: 'sora mainnet' } });
  });

  it('keeps pool identities and distinguishes LP tokens from rewards', async () => {
    const request = sources();
    request.pools.mockResolvedValue([
      {
        network: 'sora mainnet',
        isMyPool: true,
        asset1: { name: 'XOR', tokenBalance: '12', assetKey: 'xor-key' },
        asset2: { name: 'VAL', tokenBalance: '3', assetKey: 'val-key' },
      },
    ] as PoolsParamsResponse);
    request.farming.mockResolvedValue({
      available: true,
      pools: [
        {
          key: 'farm-key',
          isFarm: true,
          pooledTokens: '0',
          earnedRewards: '0.25',
          baseAsset: { symbol: 'XOR' },
          poolAsset: { symbol: 'VAL' },
          rewardAsset: { symbol: 'PSWAP' },
        },
      ],
    } as DemeterPoolsResponse);
    const { rows } = await loadPositionDashboard(request);
    expect(rows).toHaveLength(2);
    expect(rows[0].values[0].value).toBe('12 XOR · 3 VAL');
    expect(rows[0].route.query).toEqual({ asset1Key: 'xor-key', asset2Key: 'val-key' });
    expect(rows[1].title).toBe('XOR / VAL');
    expect(rows[1].values).toEqual([
      { label: 'ux.liquidityTokens', value: '0' },
      { label: 'ux.rewards', value: '0.25 PSWAP' },
    ]);
  });

  it('shows claim-only holdings once per market and marks stale results incomplete', async () => {
    const request = sources();
    request.markets.mockResolvedValue({
      ...emptyMarkets,
      indexerStale: true,
      markets: [{ id: '7', title: 'Market seven' }],
      claimable: [
        { marketId: '7', yesShares: '8', noShares: '0', claimablePayout: '0', traderPayout: '4', creatorFees: '1' },
      ],
    } as PolkamarktSnapshot);
    const result = await loadPositionDashboard(request);
    expect(result.status).toBe('partial');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].values.map((item) => item.value)).toEqual(['8 YES', '4 KUSD', '1 KUSD']);
    expect(result.rows[0].route.params).toEqual({ marketId: '7' });
  });

  it('bounds unresponsive providers and leaves an unavailable retry state', async () => {
    vi.useFakeTimers();
    try {
      const never = () => new Promise<never>(() => {});
      const pending = loadPositionDashboard({ staking: never, pools: never, farming: never, markets: never });
      await vi.advanceTimersByTimeAsync(20000);
      await expect(pending).resolves.toEqual({ rows: [], status: 'unavailable' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
