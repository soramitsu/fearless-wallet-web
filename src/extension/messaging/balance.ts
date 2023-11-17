import type {
  BalanceJson,
  FetchBalanceRequest,
  PriceJson,
  RequestSubscribePrice,
} from '@extension-base/background/types/types';

import { sendMessage } from '@/extension/messaging/index';

export function getBalance(): Promise<BalanceJson> {
  return sendMessage('pri(balance)');
}

export function fetchEvmBalance(): Promise<void> {
  return sendMessage('pri(fetch.evm.balance)');
}

export function updateFiatSymbol(symbol: string): Promise<void> {
  return sendMessage('pri(price.update.currency)', symbol);
}

export function subscribePrice(
  callback: (priceData: PriceJson) => void,
  request: RequestSubscribePrice = null
): Promise<PriceJson> {
  return sendMessage('pri(price.subscription)', request, callback);
}

export function subscribeBalance(callback: (balanceData: BalanceJson) => void): Promise<BalanceJson> {
  return sendMessage('pri(balance.subscription)', null, callback);
}

export function fetchBalance(request: FetchBalanceRequest): Promise<string> {
  return sendMessage('pri(fetch.balance)', request);
}
