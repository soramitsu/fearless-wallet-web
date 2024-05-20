import type {
  ResponseCheckTransfer,
  BasicTxResponse,
  RequestTransfer,
  RequestCrossChain,
  RequestSwap,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckCrossChain,
  RequestCheckSwap,
  ResponseCheckSwap,
  ResponseMakeSwap,
  RequestCheckScam,
} from '@extension-base/background/types/types';
import type { SoraFees } from '@/interfaces';
import type { ScamAddressList } from '@extension-base/services/scam-service/types';
import { sendMessage } from '@/extension/messaging/index';

export function checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
  return sendMessage('pri(accounts.checkTransfer)', request);
}

export function makeTransfer(
  request: RequestTransfer,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.makeTransfer)', request, callback);
}

export function checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
  return sendMessage('pri(accounts.checkCrossChain)', request);
}

export function makeCrossChain(
  request: RequestCrossChain,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.makeCrossChain)', request, callback);
}

export function checkSwap(request: RequestCheckSwap): Promise<ResponseCheckSwap> {
  return sendMessage('pri(accounts.checkSwap)', request);
}

export function makeSwap(request: RequestSwap): Promise<ResponseMakeSwap> {
  return sendMessage('pri(accounts.makeSwap)', request);
}

export function getSoraFees(): Promise<SoraFees> {
  return sendMessage('pri(accounts.getSoraFees)');
}

export function checkScamAddress(request: RequestCheckScam): Promise<boolean> {
  return sendMessage('pri(accounts.checkScamAddress)', request);
}
