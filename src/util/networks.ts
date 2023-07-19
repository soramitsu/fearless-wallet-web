import { POPULAR_NETWORKS, FAVORITE_NETWORKS } from '@/consts/networks';
import { BalanceItem } from '@/extension/background/extension-base/src/api/evm/types/ether';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import store, { Wallet } from '@/store';

export function filterBalanceItemsByNetwork(balance: BalanceItem, selectedNetwork: string) {
  const network = store.getters.getNetwork(balance.name) as NetworkJson;

  const favoriteNetworks = store.getters.getFavoriteNetworksNames as { name: string; favorite: string[] }[];
  const { address } = store.getters.getSelectedWallet as Wallet;

  if (selectedNetwork === POPULAR_NETWORKS) return !!network.popular;

  if (selectedNetwork === FAVORITE_NETWORKS) {
    return favoriteNetworks.some(
      ({ name, favorite }) => name.toLowerCase() === balance.name.toLowerCase() && favorite.includes(address)
    );
  }

  return balance.name.toLowerCase() === selectedNetwork.toLowerCase();
}
