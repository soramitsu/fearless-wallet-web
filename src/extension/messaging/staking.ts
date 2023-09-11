import {
  RequestCheckBond,
  RequestCheckRedeem,
  ResponseCheckStaking,
  RequestCheckUnbond,
  ValidatorsRequest,
  RequestCheckRebond,
  RequestStaking,
  RequestCheckStaking,
  RequestCheckBondExtra,
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

export function checkBond(request: RequestCheckBond): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkBond)', request);
}

export function checkBondExtra(request: RequestCheckBondExtra): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkBondExtra)', request);
}

function checkUnbond(request: RequestCheckUnbond): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkUnbond)', request);
}

function checkRebond(request: RequestCheckRebond): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkRebond)', request);
}

function checkRedeem(request: RequestCheckRedeem): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkRedeem)', request);
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

export function makeStaking(
  type: 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem',
  request: RequestStaking,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  if (type === 'bond') return makeBond(request as RequestBond, callback);

  if (type === 'bondExtra') return makeBondExtra(request as RequestBond, callback);

  if (type === 'unbond') return makeUnbond(request as RequestUnbond, callback);

  if (type === 'rebond') return makeRebond(request as RequestRebond, callback);

  return makeRedeem(request as RequestRedeem, callback);
}

export function checkStaking(
  type: 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem',
  request: RequestCheckStaking
): Promise<ResponseCheckStaking> {
  if (type === 'bond') return checkBond(request as RequestCheckBond);

  if (type === 'bondExtra') return checkBondExtra(request as RequestCheckBond);

  if (type === 'unbond') return checkUnbond(request as RequestCheckUnbond);

  if (type === 'rebond') return checkRebond(request as RequestCheckRebond);

  return checkRedeem(request as RequestCheckRedeem);
}
