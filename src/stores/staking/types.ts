import type {
  StakingParams,
  StakingParamsResponse,
  MyStakingInfo,
} from '@extension-base/services/staking-service/types';
import type { HistoryElement, HistoryServiceType, NetworkName, SoraHistoryElement } from '@/interfaces';

export interface NetworkParams extends StakingParams {
  loading: boolean;
  type?: 'regular';
  insights?: StakingInsights;
}

export type SoraStakingHistory = {
  kind: 'sora';
  entries: SoraHistoryElement[];
};

export type GenericStakingHistory = {
  kind: 'generic';
  serviceType?: HistoryServiceType;
  entries: HistoryElement[];
};

export type EquilibriumStakingHistory = {
  kind: 'equilibrium';
  serviceType?: HistoryServiceType;
  entries: HistoryElement[];
};

export type StakingHistory = SoraStakingHistory | GenericStakingHistory | EquilibriumStakingHistory;

export type GetStakingNetwork = (networkName: NetworkName) => NetworkParams;

export type GetStakingHistory = (
  networkName: NetworkName,
  assetId: string,
  stashAddress?: string,
  payeeAddress?: string
) => StakingHistory;

export type SetAllStakingItems = StakingParamsResponse;

export type SetMyStakingInfo = { network: NetworkName; stakingInfo: MyStakingInfo };

export type GetStakingParamsProps = { delay: number };

export type GetStakingNetworkProps = { network: NetworkName };

export type ApyHistoryPoint = {
  timestamp: number;
  value: number;
};

export type ValidatorStats = {
  active: number;
  inactive: number;
  waiting: number;
  oversubscribed: number;
};

export type StakingInsights = {
  apyTrend: ApyHistoryPoint[];
  dayChange: number;
  validatorStats: ValidatorStats;
};
