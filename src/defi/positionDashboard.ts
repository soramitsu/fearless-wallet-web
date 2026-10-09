import BigNumber from 'bignumber.js';
import type { StakingParamsResponse } from '@extension-base/services/staking-service/types';
import type { DemeterPoolsResponse, PoolsParamsResponse } from '@extension-base/services/pools-service/types';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';

export type PositionRow = {
  id: string;
  title: string;
  network: string;
  values: { label: string; value: string }[];
  route: { name: string; params?: Record<string, string>; query?: Record<string, string> };
};
export type PositionDashboard = {
  rows: PositionRow[];
  status: 'ready' | 'partial' | 'unavailable';
};
type Sources = {
  staking: () => Promise<StakingParamsResponse>;
  pools: () => Promise<PoolsParamsResponse>;
  farming: () => Promise<DemeterPoolsResponse>;
  markets: () => Promise<PolkamarktSnapshot>;
  stakingSymbol?: (network: string) => string;
};
const positive = (value?: string) => Boolean(value && new BigNumber(value).isFinite() && new BigNumber(value).gt(0));

// Bound provider waits so a failed connection always leaves the user a retry path.
async function bounded<T>(request: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Position request timed out')), 20000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadPositionDashboard(sources: Sources): Promise<PositionDashboard> {
  const [staking, pools, farming, markets] = await Promise.allSettled([
    bounded(sources.staking),
    bounded(sources.pools),
    bounded(sources.farming),
    bounded(sources.markets),
  ]);
  const rows: PositionRow[] = [];
  let available = 0;
  let stale = false;
  if (staking.status === 'fulfilled') {
    available++;
    for (const position of staking.value.filter(({ totalStake }) => positive(totalStake))) {
      rows.push({
        id: `staking:${position.network}`,
        title: position.network,
        network: position.network,
        values: [
          {
            label: 'ux.staking',
            value: `${position.totalStake} ${sources.stakingSymbol?.(position.network) ?? ''}`.trim(),
          },
        ],
        route: { name: 'MyStake', params: { network: position.network } },
      });
    }
  }
  if (pools.status === 'fulfilled') {
    available++;
    for (const pool of pools.value.filter(({ isMyPool }) => isMyPool)) {
      rows.push({
        id: `pool:${pool.network}:${pool.asset1.assetKey}:${pool.asset2.assetKey}`,
        title: `${pool.asset1.name} / ${pool.asset2.name}`,
        network: pool.network,
        values: [
          {
            label: 'ux.deposited',
            value: `${pool.asset1.tokenBalance} ${pool.asset1.name} · ${pool.asset2.tokenBalance} ${pool.asset2.name}`,
          },
        ],
        route: {
          name: 'PoolDetails',
          params: { poolName: `${pool.asset1.name}-${pool.asset2.name}` },
          query: { asset1Key: pool.asset1.assetKey, asset2Key: pool.asset2.assetKey },
        },
      });
    }
  }
  if (farming.status === 'fulfilled' && farming.value.available) {
    available++;
    for (const pool of farming.value.pools.filter(
      ({ pooledTokens, earnedRewards }) => positive(pooledTokens) || positive(earnedRewards)
    )) {
      rows.push({
        id: `farm:${pool.key}`,
        title: pool.isFarm ? `${pool.baseAsset.symbol} / ${pool.poolAsset.symbol}` : pool.poolAsset.symbol,
        network: 'SORA',
        values: [
          {
            label: pool.isFarm ? 'ux.liquidityTokens' : 'ux.deposited',
            value: pool.isFarm ? pool.pooledTokens : `${pool.pooledTokens} ${pool.poolAsset.symbol}`,
          },
          { label: 'ux.rewards', value: `${pool.earnedRewards} ${pool.rewardAsset.symbol}` },
        ],
        route: { name: 'Farming', query: { position: pool.key } },
      });
    }
  }
  if (markets.status === 'fulfilled') {
    available++;
    stale = markets.value.indexerStale;
    const snapshot = markets.value;
    const ids = new Set([
      ...snapshot.positions
        .filter((p) => [p.shares, p.yesShares, p.noShares, p.claimablePayout].some(positive))
        .map((p) => p.marketId),
      ...snapshot.claimable
        .filter((p) => [p.yesShares, p.noShares, p.traderPayout, p.claimablePayout, p.creatorFees].some(positive))
        .map((p) => p.marketId),
    ]);
    for (const id of ids) {
      const positions = snapshot.positions.filter((p) => p.marketId === id);
      const claim = snapshot.claimable.find((p) => p.marketId === id);
      const values: PositionRow['values'] = [];
      for (const position of positions) {
        if (positive(position.shares))
          values.push({ label: 'ux.shares', value: `${position.shares} ${position.outcome ?? ''}` });
        if (positive(position.yesShares)) values.push({ label: 'ux.shares', value: `${position.yesShares} YES` });
        if (positive(position.noShares)) values.push({ label: 'ux.shares', value: `${position.noShares} NO` });
      }
      if (!positions.some((p) => positive(p.shares) || positive(p.yesShares) || positive(p.noShares))) {
        if (positive(claim?.yesShares)) values.push({ label: 'ux.shares', value: `${claim!.yesShares} YES` });
        if (positive(claim?.noShares)) values.push({ label: 'ux.shares', value: `${claim!.noShares} NO` });
      }
      const payoutCandidates = claim
        ? [claim.claimablePayout, claim.traderPayout]
        : positions.map((position) => position.claimablePayout);
      const payout = payoutCandidates
        .filter(positive)
        .reduce((maximum, value) => BigNumber.maximum(maximum, value!).toFixed(), '0');
      if (positive(payout)) values.push({ label: 'ux.claimable', value: `${payout} ${snapshot.collateral}` });
      if (positive(claim?.creatorFees))
        values.push({ label: 'ux.claimable', value: `${claim!.creatorFees} ${snapshot.collateral}` });
      rows.push({
        id: `market:${id}`,
        title: snapshot.markets.find((m) => m.id === id)?.title || positions[0]?.marketTitle || `#${id}`,
        network: 'SORA',
        values,
        route: { name: 'Polkamarkt', params: { marketId: id } },
      });
    }
  }
  return { rows, status: available === 0 ? 'unavailable' : available < 4 || stale ? 'partial' : 'ready' };
}
