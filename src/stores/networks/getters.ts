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
    const walletEcosystem = accountsStore.selectedWallet.walletEcosystem;

    if (walletEcosystem === WalletEcosystem.Ton || accountsStore.selectedWallet.isTon)
      return allNetworks.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Ton));

    if (walletEcosystem === WalletEcosystem.Solana)
      return allNetworks.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Solana));

    if (walletEcosystem === WalletEcosystem.Bitcoin)
      return allNetworks.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Bitcoin));

    if (walletEcosystem === WalletEcosystem.Iroha)
      return allNetworks.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Iroha));

    const substrateAndEvmNetworks = allNetworks.filter(
      ({ ecosystem }) =>
        !isSameString(ecosystem, WalletEcosystem.Ton) &&
        !isSameString(ecosystem, WalletEcosystem.Solana) &&
        !isSameString(ecosystem, WalletEcosystem.Bitcoin) &&
        !isSameString(ecosystem, WalletEcosystem.Iroha)
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
    const walletNetworks = activeNetworks.filter(({ ecosystem }) => {
      if (selectedWallet.walletEcosystem === WalletEcosystem.Ton) return isSameString(ecosystem, WalletEcosystem.Ton);
      if (selectedWallet.walletEcosystem === WalletEcosystem.Solana)
        return isSameString(ecosystem, WalletEcosystem.Solana);
      if (selectedWallet.walletEcosystem === WalletEcosystem.Bitcoin)
        return isSameString(ecosystem, WalletEcosystem.Bitcoin);
      if (selectedWallet.walletEcosystem === WalletEcosystem.Iroha) return isSameString(ecosystem, WalletEcosystem.Iroha);

      if (isSameString(ecosystem, WalletEcosystem.Ton)) return false;
      if (isSameString(ecosystem, WalletEcosystem.Solana)) return false;
      if (isSameString(ecosystem, WalletEcosystem.Bitcoin)) return false;
      if (isSameString(ecosystem, WalletEcosystem.Iroha)) return false;

      return selectedWallet.hasEthereum || isSameString(ecosystem, WalletEcosystem.Substrate);
    });

    if (NETWORKS_GROUPS.includes(selectedNetwork)) {
      if (selectedNetwork === ALL_NETWORKS) return walletNetworks;

      if (selectedNetwork === POPULAR_NETWORKS) return walletNetworks.filter(({ rank }) => rank);

      if (selectedNetwork === FAVORITE_NETWORKS)
        return walletNetworks.filter(({ favorite }) => favorite.includes(selectedWallet.address));
    }

    return walletNetworks.filter(({ name }) => isSameString(name, selectedNetwork));
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
