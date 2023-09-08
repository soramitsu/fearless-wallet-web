import {
  BondRequest,
  RebondRequest,
  RedeemRequest,
  UnbondRequest,
  ValidatorsRequest,
} from '../background/extension-base/src/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type {
  BasicTxResponse,
  RequestCheckStaking,
  ResponseCheckStaking,
} from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

export function bond(request: BondRequest, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.bond)', null, callback);
}

export function unbond(request: UnbondRequest, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.unbond)', null, callback);
}

export function rebond(request: RebondRequest, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.rebond)', null, callback);
}

export function redeem(request: RedeemRequest, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.redeem)', null, callback);
}

export function makeStaking(
  type: 'bond' | 'unbond' | 'rebond' | 'redeem',
  request: BondRequest | UnbondRequest | RebondRequest | RedeemRequest,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  if (type === 'bond') return bond(request as BondRequest, callback);

  if (type === 'unbond') return unbond(request as UnbondRequest, callback);

  if (type === 'rebond') return rebond(request as RebondRequest, callback);

  return redeem(request as RedeemRequest, callback);
}

export function checkStaking(request: RequestCheckStaking): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkStaking)', request);
}
