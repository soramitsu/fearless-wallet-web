import type { NetworkJson } from '@extension-base/types';
import { sendMessage } from '@/extension/messaging/index';

export function upsertNetworkMap(data: NetworkJson): Promise<boolean> {
  return sendMessage('pri(networkMap.upsert)', data);
}

export function toggleFavoriteNetwork(name: string): Promise<void> {
  return sendMessage('pri(networkMap.toggle.favorite)', name);
}

export function subscribeNetworkMap(
  callback: (data: Record<string, NetworkJson>) => void
): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getSubscription)', null, callback);
}
