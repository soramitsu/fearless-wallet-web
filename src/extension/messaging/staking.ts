import {
  ValidatorsRequest,
  RequestStaking,
  RequestRedeem,
  RequestRebond,
  RequestUnbond,
  RequestBond,
  RequestBondExtra,
} from '../background/extension-base/src/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

function makeBond(request: RequestBond, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeBond)', request, callback);
}

function makeBondExtra(request: RequestBondExtra, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeBondExtra)', request, callback);
}

function makeUnbond(request: RequestUnbond, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeUnbond)', request, callback);
}

function makeRebond(request: RequestRebond, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeRebond)', request, callback);
}

function makeRedeem(request: RequestRedeem, callback: (data: BasicTxResponse) => void): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeRedeem)', request, callback);
}

function setControllerAccount(
  request: RequestRedeem,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.setControllerAccount)', request, callback);
}

export function makeStaking(
  type: 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem' | 'controllerAccount',
  request: RequestStaking,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  if (type === 'bond') return makeBond(request as RequestBond, callback);

  if (type === 'bondExtra') return makeBondExtra(request as RequestBond, callback);

  if (type === 'unbond') return makeUnbond(request as RequestUnbond, callback);

  if (type === 'rebond') return makeRebond(request as RequestRebond, callback);

  if (type === 'controllerAccount') return setControllerAccount(request as RequestRebond, callback);

  return makeRedeem(request as RequestRedeem, callback);
}
