import { describe, expect, it, vi } from 'vitest';
import type { DemeterPoolsResponse } from '@extension-base/services/pools-service/types';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';
import {
  countDemeterPositions,
  countPolkamarktPositions,
  loadSupplementalPositionSummary,
} from '@/defi/positionSummary';

const demeter = {
  available: true,
  canSign: true,
  fees: { claim: '0', deposit: '0', withdraw: '0' },
  pools: [
    { key: 'funded', pooledTokens: '1.25', earnedRewards: '0' },
    { key: 'rewards-only', pooledTokens: '0', earnedRewards: '0.01' },
    { key: 'empty', pooledTokens: '0', earnedRewards: '0' },
  ],
} as DemeterPoolsResponse;

const polkamarkt = {
  claimable: [
    { marketId: '7', yesShares: '0', noShares: '0', traderPayout: '2', creatorFees: '0' },
    { marketId: '8', yesShares: '0', noShares: '0', traderPayout: '0', creatorFees: '0' },
  ],
  indexerStale: false,
  positions: [
    { id: 'p7', marketId: '7', shares: '1', isCreator: false },
    { id: 'p9', marketId: '9', yesShares: '3', isCreator: false },
  ],
} as PolkamarktSnapshot;

describe('DeFi position summary', () => {
  it('counts positive Demeter pools and unique positive Polkamarkt markets', () => {
    expect(countDemeterPositions(demeter)).toBe(2);
    expect(countPolkamarktPositions(polkamarkt)).toBe(2);
  });

  it('keeps available position counts when one source is stale or unavailable', async () => {
    await expect(
      loadSupplementalPositionSummary({
        loadDemeter: vi.fn().mockRejectedValue(new Error('offline')),
        loadPolkamarkt: vi.fn().mockResolvedValue({ ...polkamarkt, indexerStale: true }),
      })
    ).resolves.toEqual({
      count: 2,
      status: 'partial',
      warnings: ['Demeter positions could not be refreshed.', 'Polkamarkt positions may be stale.'],
    });
  });

  it('reports an honest unavailable state when neither source can be loaded', async () => {
    await expect(
      loadSupplementalPositionSummary({
        loadDemeter: vi.fn().mockResolvedValue({ ...demeter, available: false, reason: 'Runtime unavailable.' }),
        loadPolkamarkt: vi.fn().mockRejectedValue(new Error('offline')),
      })
    ).resolves.toEqual({
      count: 0,
      status: 'unavailable',
      warnings: ['Runtime unavailable.', 'Polkamarkt positions could not be refreshed.'],
    });
  });
});
