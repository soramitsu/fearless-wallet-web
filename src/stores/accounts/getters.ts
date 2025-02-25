import { useNetworksStore } from '../networks';
import type { NftCollection } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import type { GetAutoSelectNodesValueByNetwork, GetShowWarningNetworks } from './types';
import type { State } from './state';
import { WalletEcosystem, type FiatJson } from '@/interfaces';
import { ALL_NETWORKS } from '@/consts/networks';
import { type AccountJson } from '@/extension/background/extension-base/src/background/types/types';

type Getters = {
  nftsByActiveNetworks(state: State): NftCollection[];
  selectedNetwork(state: State): string;
  fiatSymbol(state: State): string;
  getFiatId(state: State): string;
  hiddenAssets(state: State): string[];
  getShowWarningNetwork(state: State): GetShowWarningNetworks;
  getAutoSelectNodesValueByNetwork(state: State): GetAutoSelectNodesValueByNetwork;
  isCustomSort(state: State): (address: string) => boolean;
  allAcountsEcosystem(state: State): AccountJson[];
  acountsEcosystem(state: State): AccountJson[];
};

export const getters: Getters = {
  nftsByActiveNetworks(state): NftCollection[] {
    const networksStore = useNetworksStore();
    const activeNetworks: NetworkJson[] = networksStore.activeNetworkForSelectedWallet;
    const nfts: NftCollection[] = [];

    activeNetworks.forEach(({ chainId }) => {
      const nftChain = state.nfts[chainId];

      if (nftChain) nfts.push(...Object.values(nftChain));
    });

    return nfts;
  },

  hiddenAssets({ selectedWallet, hiddenAssetsForAllAccounts }) {
    const { address } = selectedWallet;

    return hiddenAssetsForAllAccounts[address] ?? [];
  },

  selectedNetwork({ selectedNetworks, selectedWallet: { address } }) {
    return selectedNetworks[address] ?? ALL_NETWORKS;
  },

  fiatSymbol({ selectedFiat }) {
    const networksStore = useNetworksStore();
    const fiats: FiatJson[] = networksStore.fiats;
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.symbol ?? '';
  },

  getFiatId({ selectedFiat }) {
    const networksStore = useNetworksStore();
    const fiats: FiatJson[] = networksStore.fiats;
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.id ?? '';
  },

  getAutoSelectNodesValueByNetwork:
    ({ autoSelectNode }) =>
    (networkName: string) => {
      return autoSelectNode[networkName] ?? true;
    },

  allAcountsEcosystem({ accounts, selectedWallet: { isSubstrate, isTon } }) {
    return accounts.filter(
      ({ walletEcosystem }) =>
        !(
          (walletEcosystem === WalletEcosystem.Ton && isSubstrate) ||
          (walletEcosystem === WalletEcosystem.Substrate && isTon)
        )
    );
  },

  acountsEcosystem() {
    return (this.allAcountsEcosystem as unknown as AccountJson[]).filter(({ active }) => !active);
  },

  getShowWarningNetwork:
    ({ hiddenWarningNetworks }) =>
    (networkName: string) => {
      return hiddenWarningNetworks.includes(networkName);
    },

  isCustomSort:
    ({ isCustomSorted }) =>
    (address: string) => {
      return isCustomSorted[address] ?? false;
    },
};
