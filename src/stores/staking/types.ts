import type {
  StakingParams,
  StakingParamsResponse,
  MyStakingInfo,
} from '@extension-base/services/staking-service/types';
import type { HistoryElement, NetworkName, SoraHistoryElement } from '@/interfaces';

export interface NetworkParams extends StakingParams {
  transferableAmount: string;
  asset: string;
  assetId: string;
  icon: string;
  loading: boolean;
  type?: 'regular';
}

export type StakingHistory = HistoryElement | SoraHistoryElement; // TODO

export type GetStakingNetwork = (networkName: NetworkName) => NetworkParams;

export type GetStakingHistory = (
  networkName: NetworkName,
  assetId: string,
  stashAddress?: string,
  payeeAddress?: string
) => StakingHistory[];

export type SetAllStakingItems = StakingParamsResponse;

export type SetMyStakingInfo = { network: NetworkName; stakingInfo: MyStakingInfo };

export type GetStakingParamsProps = { delay: number };

export type GetStakingNetworkProps = { network: NetworkName };
