import { u8aEq } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';

import type { HistoryElement } from '@/interfaces/history';

const LEGACY_CROWDLOAN_NETWORKS = new Set(['polkadot', 'kusama']);
const CONTRIBUTION_METHODS = new Set(['contribute', 'contributeall', 'contributed']);
const RECOVERY_METHODS = new Set([
  'claim',
  'claimed',
  'claimreward',
  'claimrewards',
  'contributionwithdrawn',
  'redeem',
  'refund',
  'refunded',
  'rewardclaimed',
  'rewardsclaimed',
  'withdraw',
  'withdrawcontribution',
  'withdrawn',
  'withdrew',
]);

export type LegacyCrowdloanAssetContext = {
  networkName: string;
  assetId: string;
  utilityAssetId: string;
  isNative: boolean;
  isUtility: boolean;
  walletAddress: string;
};

export type LegacyCrowdloanEvidence = {
  contributionCount: number;
  recoveryCount: number;
  hasEvidence: boolean;
};

function normalizedIdentifier(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^a-z0-9]/gi, '').toLowerCase() : '';
}

function isSameSubstrateAccount(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;

  try {
    return u8aEq(decodeAddress(left), decodeAddress(right));
  } catch {
    return false;
  }
}

export function isLegacyCrowdloanAssetContext(context: LegacyCrowdloanAssetContext): boolean {
  return (
    LEGACY_CROWDLOAN_NETWORKS.has(context.networkName.trim().toLowerCase()) &&
    context.assetId === context.utilityAssetId &&
    (context.isNative || context.isUtility) &&
    context.walletAddress.trim().length > 0
  );
}

export function getLegacyCrowdloanEvidence(
  context: LegacyCrowdloanAssetContext,
  history: readonly HistoryElement[]
): LegacyCrowdloanEvidence {
  if (!isLegacyCrowdloanAssetContext(context)) {
    return { contributionCount: 0, recoveryCount: 0, hasEvidence: false };
  }

  let contributionCount = 0;
  let recoveryCount = 0;

  history.forEach((item) => {
    if (!item.success || !isSameSubstrateAccount(item.address, context.walletAddress)) return;
    if (!normalizedIdentifier(item.module).includes('crowdloan')) return;

    const method = normalizedIdentifier(item.method ?? item.name);

    if (CONTRIBUTION_METHODS.has(method)) contributionCount += 1;
    if (RECOVERY_METHODS.has(method)) recoveryCount += 1;
  });

  return {
    contributionCount,
    recoveryCount,
    hasEvidence: contributionCount > 0 || recoveryCount > 0,
  };
}
