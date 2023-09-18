import {
  ValidatorsRequest,
  MakeStakingRequest,
  StakingParamsRequest,
  StakingParamsResponse,
} from '../background/extension-base/src/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

export function getStakingParams(request: StakingParamsRequest): Promise<StakingParamsResponse> {
  return sendMessage('pri(staking.stakingParams)', request);
}

export function makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeStaking)', request);
}
