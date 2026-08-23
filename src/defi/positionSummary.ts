import { FPNumber } from '@sora-substrate/util';
import type { DemeterPoolsResponse } from '@extension-base/services/pools-service/types';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';

export type SupplementalPositionStatus = 'ready' | 'partial' | 'unavailable';

export type SupplementalPositionSummary = {
  count: number;
  status: SupplementalPositionStatus;
  warnings: string[];
};

const isPositive = (value?: string): boolean => {
  if (!value) return false;

  try {
    return new FPNumber(value).isGreaterThan(FPNumber.ZERO);
  } catch {
    return false;
  }
};

export function countDemeterPositions(snapshot: DemeterPoolsResponse): number {
  if (!snapshot.available) return 0;
  return snapshot.pools.filter(({ earnedRewards, pooledTokens }) =>
    isPositive(pooledTokens) || isPositive(earnedRewards)
  ).length;
}

export function countPolkamarktPositions(snapshot: PolkamarktSnapshot): number {
  const marketIds = new Set<string>();

  snapshot.positions.forEach((position) => {
    if (
      [
        position.shares,
        position.yesShares,
        position.noShares,
        position.claimablePayout,
      ].some(isPositive)
    ) {
      marketIds.add(position.marketId);
    }
  });
  snapshot.claimable.forEach((claim) => {
    if (
      [claim.yesShares, claim.noShares, claim.claimablePayout, claim.traderPayout, claim.creatorFees].some(
        isPositive
      )
    ) {
      marketIds.add(claim.marketId);
    }
  });

  return marketIds.size;
}

export async function loadSupplementalPositionSummary({
  loadDemeter,
  loadPolkamarkt,
}: {
  loadDemeter: () => Promise<DemeterPoolsResponse>;
  loadPolkamarkt: () => Promise<PolkamarktSnapshot>;
}): Promise<SupplementalPositionSummary> {
  const [demeterResult, polkamarktResult] = await Promise.allSettled([loadDemeter(), loadPolkamarkt()]);
  let count = 0;
  let availableSources = 0;
  const warnings: string[] = [];

  if (demeterResult.status === 'fulfilled' && demeterResult.value.available) {
    availableSources += 1;
    count += countDemeterPositions(demeterResult.value);
  } else {
    warnings.push(
      demeterResult.status === 'fulfilled'
        ? demeterResult.value.reason ?? 'Demeter positions are unavailable.'
        : 'Demeter positions could not be refreshed.'
    );
  }

  if (polkamarktResult.status === 'fulfilled') {
    availableSources += 1;
    count += countPolkamarktPositions(polkamarktResult.value);
    if (polkamarktResult.value.indexerStale) warnings.push('Polkamarkt positions may be stale.');
  } else {
    warnings.push('Polkamarkt positions could not be refreshed.');
  }

  return {
    count,
    status: availableSources === 0 ? 'unavailable' : warnings.length ? 'partial' : 'ready',
    warnings,
  };
}
