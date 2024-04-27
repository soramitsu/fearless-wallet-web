import type { DefaultPoolsParams, PoolsParamsResponse, AssetPool } from '@extension-base/services/pools-service/types';
import type { Mutations } from '@/store/pools/mutations';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/pools/state';

interface FullAssetPool extends AssetPool {
  transferableAmount: string;
}

export interface PoolParams extends DefaultPoolsParams {
  loading: boolean;
  asset1: FullAssetPool;
  asset2: FullAssetPool;
}

export type SetAllPoolsItems = PoolsParamsResponse;

export type GetPoolsParamsProps = { delay: number };

export type AugmentedPoolsContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
