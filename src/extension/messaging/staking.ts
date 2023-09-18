import {
  ValidatorsRequest,
  MakeStakingRequest,
  BondingDurationRequest,
  BondingDurationResponse,
} from '../background/extension-base/src/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';
import { NetworkName } from '@/interfaces';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

export function getMaxNominations(network: NetworkName): Promise<number> {
  return sendMessage('pri(staking.maxNominations)', network);
}

export function getBondingDuration(request: BondingDurationRequest): Promise<BondingDurationResponse> {
  return sendMessage('pri(staking.bondingDuration)', request);
}

export function makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeStaking)', request);
}
