import type { ResponseCheckTransfer, BasicTxResponse } from '@extension-base/background/types/types';
import type {
  RequestTransfer,
  RequestCrossChain,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckCrossChain,
  RequestCheckSwap,
  ResponseCheckSwap,
  RequestSwap,
  ResponseMakeSwap,
} from '@extension-base/background/types';
import type { SoraFees } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
  return sendMessage('pri(accounts.checkTransfer)', request);
}

export function makeTransfer(
  request: RequestTransfer,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.transfer)', request, callback);
}

export function checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
  return sendMessage('pri(accounts.checkCrossChain)', request);
}

export function makeCrossChain(
  request: RequestCrossChain,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.crossChain)', request, callback);
}

export function getSoraFees(): Promise<SoraFees> {
  return sendMessage('pri(accounts.soraFees)');
}

export function makeSwap(request: RequestSwap): Promise<ResponseMakeSwap> {
  return sendMessage('pri(accounts.swap)', request);
}

export function checkSwap(request: RequestCheckSwap): Promise<ResponseCheckSwap> {
  return sendMessage('pri(accounts.checkSwap)', request);
}
