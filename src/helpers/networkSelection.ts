import type { NetworkJson } from '@extension-base/types';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

/**
 * Whether a network is one of the "Popular" networks: the registry gives it a rank. SORA Mainnet holds rank 0, the first
 * place, so the rank is tested for being a number, never for truthiness (that left SORA switched off and Polkaswap
 * unusable for every wallet on the default "Popular" selection).
 */
export function isPopularNetwork(network: Pick<NetworkJson, 'rank'> | undefined): boolean {
  return Number.isFinite(network?.rank);
}

export function matchesNetworkSelection(network: NetworkJson | undefined, selection: string, address = '') {
  if (!network) return false;

  const selected = selection.toLowerCase();
  if (selected === ALL_NETWORKS) return true;
  if (selected === POPULAR_NETWORKS) return isPopularNetwork(network);
  if (selected === FAVORITE_NETWORKS) return Boolean(address && network.favorite?.includes(address));

  return network.name.toLowerCase() === selected;
}
