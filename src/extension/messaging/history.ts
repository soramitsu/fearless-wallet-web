import type { HistoryFetchRequest, HistoryFetchResponse } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function fetchAssetHistory(request: HistoryFetchRequest): Promise<HistoryFetchResponse | null> {
  return sendMessage('pri(history.fetchAsset)', request);
}
