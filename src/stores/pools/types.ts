import type { DefaultPoolsParams, PoolsParamsResponse, AssetPool } from '@extension-base/services/pools-service/types';

interface FullAssetPool extends AssetPool {
  transferableAmount: string;
  priceId: string;
  icon: string;
  color: string;
}

export interface StatePoolParams extends DefaultPoolsParams {
  loading: boolean;
}

export interface PoolParams extends StatePoolParams {
  loading: boolean;
  asset1: FullAssetPool;
  asset2: FullAssetPool;
}

export type SetAllPoolsItems = PoolsParamsResponse;

export type GetPoolsParamsProps = { delay: number };
