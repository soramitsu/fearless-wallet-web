import { encodeAddress } from '@polkadot/util-crypto';
import { describe, expect, it } from 'vitest';

import type { HistoryElement } from '@/interfaces/history';
import {
  getLegacyCrowdloanEvidence,
  isLegacyCrowdloanAssetContext,
  type LegacyCrowdloanAssetContext,
} from '@/portfolio/legacyCrowdloan';

const publicKey = new Uint8Array(32).fill(7);
const polkadotAddress = encodeAddress(publicKey, 0);
const substrateAddress = encodeAddress(publicKey, 42);

function context(overrides: Partial<LegacyCrowdloanAssetContext> = {}): LegacyCrowdloanAssetContext {
  return {
    networkName: 'Polkadot',
    assetId: 'DOT',
    utilityAssetId: 'DOT',
    isNative: true,
    isUtility: true,
    walletAddress: substrateAddress,
    ...overrides,
  };
}

function event(overrides: Partial<HistoryElement> = {}): HistoryElement {
  return {
    id: 'event-1',
    address: polkadotAddress,
    timestamp: '1',
    success: true,
    module: 'Crowdloan',
    method: 'contribute',
    ...overrides,
  };
}

describe('contextual legacy crowdloan visibility', () => {
  it('accepts only the network-scoped native asset on Polkadot or Kusama', () => {
    expect(isLegacyCrowdloanAssetContext(context())).toBe(true);
    expect(
      isLegacyCrowdloanAssetContext(context({ networkName: 'Kusama', assetId: 'KSM', utilityAssetId: 'KSM' }))
    ).toBe(true);
    expect(isLegacyCrowdloanAssetContext(context({ networkName: 'Acala' }))).toBe(false);
    expect(isLegacyCrowdloanAssetContext(context({ assetId: 'USDT' }))).toBe(false);
    expect(isLegacyCrowdloanAssetContext(context({ isNative: false, isUtility: false }))).toBe(false);
  });

  it('requires successful, account-scoped Crowdloan activity rather than a generic balance lock', () => {
    expect(getLegacyCrowdloanEvidence(context(), [event()])).toEqual({
      contributionCount: 1,
      recoveryCount: 0,
      hasEvidence: true,
    });
    expect(getLegacyCrowdloanEvidence(context(), [event({ success: false })]).hasEvidence).toBe(false);
    expect(
      getLegacyCrowdloanEvidence(context(), [event({ address: encodeAddress(new Uint8Array(32).fill(8), 0) })])
        .hasEvidence
    ).toBe(false);
    expect(getLegacyCrowdloanEvidence(context(), [event({ module: 'Balances', method: 'locked' })]).hasEvidence).toBe(
      false
    );
  });

  it('recognizes claims and withdrawals without consulting stale crowdloan metadata', () => {
    const evidence = getLegacyCrowdloanEvidence(context(), [
      event({ id: 'claim', module: 'CrowdloanRewards', method: 'RewardClaimed' }),
      event({ id: 'withdraw', method: 'withdraw' }),
      event({ id: 'unrelated', module: 'Staking', method: 'withdraw' }),
    ]);

    expect(evidence).toEqual({ contributionCount: 0, recoveryCount: 2, hasEvidence: true });
  });
});
