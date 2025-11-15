import type { DefaultPoolsParams, PoolsParamsResponse } from '@extension-base/services/pools-service/types';

export interface StatePoolParams extends DefaultPoolsParams {
  loading: boolean;
}

export type PoolParams = StatePoolParams;

export type SetAllPoolsItems = PoolsParamsResponse;

export type GetPoolsParamsProps = { delay: number };
