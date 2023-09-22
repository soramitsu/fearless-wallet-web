import {
  FWValidatorInfoFull,
  StakingParams,
  StakingParamsResponse,
} from '@extension-base/services/staking-service/types';
import type { Mutations } from '@/store/staking/mutations';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/staking/state';
import { NetworkName } from '@/interfaces';

export interface NetworkParams extends StakingParams {
  bondAmount: string;
  transferableAmount: string;
  asset: string;
  assetId: string;
  icon: string;
  type?: 'regular';
}

export type GetStakingNetwork = (networkName: NetworkName) => NetworkParams;

export type SetAllStakingItems = StakingParamsResponse;

export type SetMyValidators = { network: NetworkName; myValidators: FWValidatorInfoFull[] };

export type GetMyValidatorsProps = { network: NetworkName };

export type AugmentedStakingContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
