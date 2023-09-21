import {
  MakeStakingRequest,
  StakingParamsRequest,
  StakingParamsResponse,
} from '../background/extension-base/src/services/staking-service/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getStakingParams(request: StakingParamsRequest): Promise<StakingParamsResponse> {
  return sendMessage('pri(staking.stakingParams)', request);
}

export function makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeStaking)', request);
}
