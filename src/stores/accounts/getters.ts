import { useExtensionStore } from '../extension';
import { useNetworksStore } from '../networks';
import type { NftCollection } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import type { WalletInfo, GetAutoSelectNodesValueByNetwork, GetShowWarningNetworks } from './types';
import type { State } from './state';
import type { FiatJson } from '@/interfaces';
import { ALL_NETWORKS } from '@/consts/networks';

type Getters = {
  nftsByActiveNetworks(state: State): NftCollection[];
  selectedNetwork(state: State): string;
  fiatSymbol(state: State): string;
  getFiatId(state: State): string;
  hiddenAssets(state: State): string[];
  getWallets(state: State): WalletInfo[];
  showSoraCardBanner(state: State): boolean;
  getShowWarningNetwork(state: State): GetShowWarningNetworks;
  getAutoSelectNodesValueByNetwork(state: State): GetAutoSelectNodesValueByNetwork;
  isCustomSort(state: State): (address: string) => boolean;
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

  getWallets({ accounts }) {
    return accounts.map((account) => ({
      name: account.name,
      ethereumAddress: account.ethereumAddress,
      address: account.address,
      isMobile: !!account.isMobile,
      active: !!account.active,
    }));
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

  showSoraCardBanner({ soraCardBannerVisibility }) {
    const extensionStore = useExtensionStore();

    const features = extensionStore.$state.features;
    const soraCard = features?.fiat?.soraCard;

    return !!soraCard && soraCardBannerVisibility;
  },
};
