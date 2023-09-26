import { StakingParams, StakingParamsResponse, MyStakingInfo } from '@extension-base/services/staking-service/types';
import type { Mutations } from '@/store/staking/mutations';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/staking/state';
import { NetworkName } from '@/interfaces';

export interface NetworkParams extends StakingParams {
  transferableAmount: string;
  asset: string;
  assetId: string;
  icon: string;
  loading: boolean;
  type?: 'regular';
}

export type GetStakingNetwork = (networkName: NetworkName) => NetworkParams;

export type SetAllStakingItems = StakingParamsResponse;

export type SetMyStakingInfo = { network: NetworkName; stakingInfo: MyStakingInfo };

export type GetStakingNetworkProps = { network: NetworkName };

export type AugmentedStakingContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
