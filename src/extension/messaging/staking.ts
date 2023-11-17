import type {
  MakeStakingRequest,
  StakingParamsRequest,
  StakingParamsResponse,
  StakingNetworkRequest,
  MyStakingInfoResponse,
  RewardsResponse,
  CheckControllerRequest,
  getRewardsRequest,
} from '../background/extension-base/src/services/staking-service/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getStakingParams(request: StakingParamsRequest): Promise<StakingParamsResponse> {
  return sendMessage('pri(staking.stakingParams)', request);
}

export function checkController(request: CheckControllerRequest): Promise<boolean> {
  return sendMessage('pri(staking.checkController)', request);
}

export function getRewards(request: getRewardsRequest): Promise<RewardsResponse> {
  return sendMessage('pri(staking.rewards)', request);
}

export function getMyStakingInfo(request: StakingNetworkRequest): Promise<MyStakingInfoResponse> {
  return sendMessage('pri(staking.myStaking)', request);
}

export function makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeStaking)', request);
}
