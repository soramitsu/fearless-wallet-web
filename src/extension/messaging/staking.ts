import {
  ValidatorsRequest,
  RequestStaking,
  RequestRedeem,
  RequestRebond,
  RequestUnbond,
  RequestBond,
  RequestBondExtra,
  RequestSetControllerAccount,
} from '../background/extension-base/src/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(request: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
  return sendMessage('pri(staking.validators)', request);
}

function makeBond(request: RequestBond): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeBond)', request);
}

function makeBondExtra(request: RequestBondExtra): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeBondExtra)', request);
}

function makeUnbond(request: RequestUnbond): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeUnbond)', request);
}

function makeRebond(request: RequestRebond): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeRebond)', request);
}

function makeRedeem(request: RequestRedeem): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.makeRedeem)', request);
}

function setControllerAccount(request: RequestSetControllerAccount): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.setControllerAccount)', request);
}

export function makeStaking(
  type: 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem' | 'controllerAccount',
  request: RequestStaking
): Promise<BasicTxResponse> {
  if (type === 'bond') return makeBond(request as RequestBond);

  if (type === 'bondExtra') return makeBondExtra(request as RequestBond);

  if (type === 'unbond') return makeUnbond(request as RequestUnbond);

  if (type === 'rebond') return makeRebond(request as RequestRebond);

  if (type === 'redeem') return makeRedeem(request as RequestRedeem);

  return setControllerAccount(request as RequestSetControllerAccount);
}
