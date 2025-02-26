import { useAccountsStore } from '../accounts';
import type { NetworkJson } from '@extension-base/types';
import type { GetNetwork, GetAssetPrice, GetNetworkGenesisHash, GetActiveNodesByNetwork } from './types';
import type { State } from './state';
import { WalletEcosystem, type GetHistory } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { ALL_NETWORKS, FAVORITE_NETWORKS, NETWORKS_GROUPS, POPULAR_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';

type Getters = {
  networks(state: State): NetworkJson[];
  activeNetworkForSelectedWallet(state: State): NetworkJson[];
  favoriteNetworksNames(state: State): { name: string; favorite: string[] }[];
  getNetwork(state: State): GetNetwork;
  getHistory(state: State): GetHistory;
  getActiveNodesByNetwork(state: State): GetActiveNodesByNetwork;
  getNetworkGenesisHash(state: State): GetNetworkGenesisHash;
  getAssetPrice(state: State): GetAssetPrice;
};

export const getters: Getters = {
  networks({ allNetworks }): NetworkJson[] {
    const accountsStore = useAccountsStore();

    if (accountsStore.selectedWallet.isTon)
      return allNetworks.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Ton));

    const substrateAndEvmNetworks = allNetworks.filter(
      ({ ecosystem }) => !isSameString(ecosystem, WalletEcosystem.Ton)
    );

    const substrateNetworks = substrateAndEvmNetworks.filter(({ ecosystem }) =>
      isSameString(ecosystem, WalletEcosystem.Substrate)
    );

    return accountsStore.selectedWallet.hasEthereum ? substrateAndEvmNetworks : substrateNetworks;
  },

  activeNetworkForSelectedWallet({ allNetworks }): NetworkJson[] {
    const accountsStore = useAccountsStore();

    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork.toLowerCase();

    const activeNetworks = allNetworks.filter(({ active }) => active);

    if (NETWORKS_GROUPS.includes(selectedNetwork)) {
      if (selectedNetwork === ALL_NETWORKS) return activeNetworks;

      if (selectedNetwork === POPULAR_NETWORKS) return activeNetworks.filter(({ rank }) => rank);

      if (selectedNetwork === FAVORITE_NETWORKS)
        return activeNetworks.filter(({ favorite }) => favorite.includes(selectedWallet.address));
    }

    return activeNetworks.filter(({ name }) => isSameString(name, selectedNetwork));
  },

  favoriteNetworksNames({ allNetworks }) {
    return allNetworks.filter(({ favorite }) => favorite.length).map(({ name, favorite }) => ({ name, favorite }));
  },

  getNetwork:
    ({ allNetworks }) =>
    (networkNameOrChainId: string) => {
      return allNetworks.find(
        ({ name, chainId }) => isSameString(name, networkNameOrChainId) || isSameString(chainId, networkNameOrChainId)
      )!;
    },

  getNetworkGenesisHash:
    ({ allNetworks }) =>
    (networkName: string) => {
      const network = allNetworks.find(({ name }) => name === networkName)!;

      return `0x${network.chainId}`;
    },

  getAssetPrice:
    ({ assetsPrice }) =>
    (priceId: string) => {
      // либо цены нет вообще
      // либо цена === 0, как в кейсе для сора сабквери прайсинга
      if (!assetsPrice.tokenPriceMap[priceId]) return { price: 0, priceChange: 0, isExist: false };

      const price = assetsPrice.tokenPriceMap[priceId];
      const priceChange = assetsPrice.tokenPriceChange[priceId] / 100;

      return { price, priceChange, isExist: true };
    },

  getHistory:
    ({ history }) =>
    (assetId: string, networkName: string, address?: string) => {
      const accountsStore = useAccountsStore();
      const wallet = accountsStore.selectedWallet;

      const _address = address ? BaseApi.formatAddress({ address, ethereumAddress: address }) : wallet.address;

      return history[assetId]?.[_address]?.[networkName.toLowerCase()];
    },

  getActiveNodesByNetwork:
    ({ allNetworks }) =>
    (networkName: string) => {
      const { currentProvider, nodes } = allNetworks.find(
        (net) => net.name.toLowerCase() === networkName.toLowerCase()
      )!;

      const node = nodes.find((node) => node.url === currentProvider);

      return !node ? nodes[0] : node;
    },
};
