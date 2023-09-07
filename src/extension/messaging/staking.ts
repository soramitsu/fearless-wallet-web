import type {
  BasicTxResponse,
  RequestStaking,
  RequestCheckStaking,
  ResponseCheckStaking,
} from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getValidators(): Promise<any> {
  return sendMessage('pri(accounts.soraFees)');
}

export function checkStaking(request: RequestCheckStaking): Promise<ResponseCheckStaking> {
  return sendMessage('pri(staking.checkStaking)', request);
}

export function makeStaking(
  request: RequestStaking,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.stake)', request, callback);
}
