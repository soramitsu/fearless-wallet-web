import type { NetworkJson } from '@extension-base/types';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

export function matchesNetworkSelection(network: NetworkJson | undefined, selection: string, address = '') {
  if (!network) return false;

  const selected = selection.toLowerCase();
  if (selected === ALL_NETWORKS) return true;
  if (selected === POPULAR_NETWORKS) return network.rank !== undefined;
  if (selected === FAVORITE_NETWORKS) return Boolean(address && network.favorite?.includes(address));

  return network.name.toLowerCase() === selected;
}
