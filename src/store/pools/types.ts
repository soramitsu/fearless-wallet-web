import {
  type PoolsParams,
  type PoolsParamsResponse,
  type MyPoolsInfo,
} from '@extension-base/services/pools-service/types';
import type { Mutations } from '@/store/pools/mutations';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/pools/state';
import { type HistoryElement, type NetworkName, type SoraHistoryElement } from '@/interfaces';

export interface PoolsNetworkParams extends PoolsParams {
  transferableAmount: string;
  asset: string;
  assetId: string;
  icon: string;
  loading: boolean;
  type?: 'regular';
}

export type PoolsHistory = HistoryElement | SoraHistoryElement; // TODO

export type GetPoolsNetwork = (networkName: NetworkName) => PoolsNetworkParams;

export type GetPoolsHistory = (
  networkName: NetworkName,
  assetId: string,
  stashAddress?: string,
  payeeAddress?: string
) => PoolsHistory[];

export type SetAllPoolsItems = PoolsParamsResponse;

export type SetMyPoolsInfo = { network: NetworkName; poolsInfo: MyPoolsInfo };

export type GetPoolsParamsProps = { delay: number };

export type GetPoolsNetworkProps = { network: NetworkName };

export type AugmentedPoolsContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
