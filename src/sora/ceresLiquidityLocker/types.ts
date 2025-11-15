import type { FPNumber } from '@sora/math';

export type AccountLockedPool = {
  poolTokens: FPNumber;
  unlockingTimestamp: number;
  assetA: string;
  assetB: string;
};
