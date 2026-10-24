import { nodePreferences } from '@extension-base/services/network-service/preferences';
import type { NetworkJson } from '@extension-base/types';
import { sendMessage } from '@/extension/messaging/index';

export function upsertNetworkMap(data: NetworkJson, previous?: Parameters<typeof nodePreferences>[0]): Promise<void> {
  return sendMessage('pri(networkMap.upsert)', previous ? { network: data, expected: nodePreferences(previous) } : data);
}

export function toggleFavoriteNetwork(networkName: string, address?: string, favorite?: boolean): Promise<void> {
  return sendMessage('pri(networkMap.toggle.favorite)', address ? { networkName, address, favorite } : networkName);
}

export function subscribeNetworkMap(
  callback: (data: Record<string, NetworkJson>) => void
): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getSubscription)', null, callback);
}

export function subscribeSelectedNetworks(callback: (data: string) => void): Promise<string> {
  return sendMessage('pri(selectedNetworks.getSubscription)', null, callback);
}
