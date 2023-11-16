import type {
  MakeStakingRequest,
  StakingParamsRequest,
  StakingParamsResponse,
  StakingNetworkRequest,
  MyStakingInfoResponse,
  RewardsResponse,
} from '@extension-base/services/staking-service/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';
import { type NetworkName } from '@/interfaces';

export function getStakingParams(request: StakingParamsRequest): Promise<StakingParamsResponse> {
  return sendMessage('pri(staking.stakingParams)', request);
}

export function getRewards(network: NetworkName): Promise<RewardsResponse> {
  return sendMessage('pri(staking.rewards)', network);
}

export function getMyStakingInfo(request: StakingNetworkRequest): Promise<MyStakingInfoResponse> {
  return sendMessage('pri(staking.myStaking)', request);
}

export function makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeStaking)', request);
}
