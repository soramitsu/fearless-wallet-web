import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type {
  BasicTxResponse,
  RequestCheckStaking,
  ResponseCheckStaking,
  ValidatorsRequest,
} from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

export function bond(callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.bond)', null, callback);
}

export function unbond(callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.unbond)', null, callback);
}

export function rebond(callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.rebond)', null, callback);
}

export function redeem(callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.redeem)', null, callback);
}

export function makeStaking(
  type: 'bond' | 'unbond' | 'rebond' | 'redeem',
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  if (type === 'bond') return bond(callback);

  if (type === 'unbond') return unbond(callback);

  if (type === 'rebond') return rebond(callback);

  return redeem(callback);
}

export function checkStaking(request: RequestCheckStaking): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkStaking)', request);
}
