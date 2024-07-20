import { type NftCollection, type AvailableNftState } from '@extension-base/services/nft-service/types';
import { type NetworkJson } from '@extension-base/types';
import type { TokenGroup, AccountJson } from '@extension-base/background/types/types';
import type { GetterTree } from 'vuex';
import type { SelectedWallet, WalletInfo, GetAutoSelectNodesValueByNetwork, GetShowWarningNetworks } from './types';
import type { State } from './state';
import type { FiatJson } from '@/interfaces';
import type { Features } from '@/store/extension/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import store from '@/store';
import { ALL_NETWORKS } from '@/consts/networks';

export enum GettersTypes {
  selectedWallet = 'selectedWallet',
  selectedFiat = 'selectedFiat',
  selectedNetwork = 'selectedNetwork',
  fiatSymbol = 'fiatSymbol',
  getFiatId = 'getFiatId',
  getAccounts = 'getAccounts',
  getEthAccounts = 'getEthAccounts',
  hiddenAssets = 'hiddenAssets',
  getBalances = 'getBalances',
  nfts = 'nfts',
  availableNfts = 'availableNfts',
  getWallets = 'getWallets',
  getAutoSelectNodesValueByNetwork = 'getAutoSelectNodesValueByNetwork',
  GET_QR = 'getQR',
  getIsCustomSort = 'getIsCustomSort',
  showPolkaswapAlert = 'showPolkaswapAlert',
  getShowWarningNetwork = 'getShowWarningNetwork',
  showSoraCardBanner = 'showSoraCardBanner',
}

export type Getters = {
  [GettersTypes.selectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getBalances](state: State, getters?: GetterTree<State, State> & Getters): TokenGroup[];
  [GettersTypes.nfts](state: State, getters: GetterTree<State, State>): NftCollection[];
  [GettersTypes.availableNfts](state: State, getters?: GetterTree<State, State> & Getters): AvailableNftState;
  [GettersTypes.selectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.selectedNetwork](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.fiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatId](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.hiddenAssets](state: State, getters?: GetterTree<State, State> & Getters): string[];
  [GettersTypes.getAccounts](state: State, getters?: GetterTree<State, State> & Getters): AccountJson[];
  [GettersTypes.getEthAccounts](state: State, getters?: GetterTree<State, State> & Getters): string[];
  [GettersTypes.getWallets](state: State, getters?: GetterTree<State, State> & Getters): WalletInfo[];
  [GettersTypes.showPolkaswapAlert](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.showSoraCardBanner](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getShowWarningNetwork](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetShowWarningNetworks;
  [GettersTypes.getAutoSelectNodesValueByNetwork](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetAutoSelectNodesValueByNetwork;
  [GettersTypes.GET_QR](state: State, getters?: GetterTree<State, State> & Getters): Nullable<string>;
  [GettersTypes.getIsCustomSort](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): (address: string) => boolean;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.selectedWallet]({ selectedWallet }): SelectedWallet {
    return selectedWallet;
  },

  [GettersTypes.getBalances](state): TokenGroup[] {
    return state.balances;
  },

  [GettersTypes.nfts](state): NftCollection[] {
    const activeNetworks: NetworkJson[] = store.getters[NetworksGettersTypes.activeNetworkForSelectedWallet];
    const nfts: NftCollection[] = [];

    activeNetworks.forEach(({ chainId }) => {
      const nftChain = state.nfts[chainId];

      if (nftChain) nfts.push(...Object.values(nftChain));
    });

    return nfts;
  },

  [GettersTypes.availableNfts](state): AvailableNftState {
    return state.availableNfts;
  },

  [GettersTypes.hiddenAssets]({ selectedWallet, hiddenAssets }): any {
    const { address } = selectedWallet;

    return hiddenAssets[address] ?? [];
  },

  [GettersTypes.selectedFiat]({ selectedFiat }): string {
    return selectedFiat;
  },

  [GettersTypes.selectedNetwork]({ selectedNetworks, selectedWallet: { address } }): string {
    return selectedNetworks[address] ?? ALL_NETWORKS;
  },

  [GettersTypes.showPolkaswapAlert]({ showPolkaswapAlert }): boolean {
    return showPolkaswapAlert;
  },

  [GettersTypes.fiatSymbol]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.fiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.symbol ?? '';
  },

  [GettersTypes.getFiatId]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.fiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.id ?? '';
  },

  [GettersTypes.getAccounts](state): AccountJson[] {
    return state.accounts;
  },

  [GettersTypes.getEthAccounts](state): string[] {
    return state.accounts.filter((el) => el.ethereumAddress !== '').map((el) => el.ethereumAddress);
  },

  [GettersTypes.getAutoSelectNodesValueByNetwork]:
    ({ autoSelectNode }) =>
    (networkName: string) => {
      return autoSelectNode[networkName] ?? true;
    },

  [GettersTypes.getWallets]({ accounts }): WalletInfo[] {
    const wallets: WalletInfo[] = [];

    accounts.forEach((account) => {
      wallets.push({
        name: account.name,
        ethereumAddress: account.ethereumAddress,
        address: account.address,
        isMobile: !!account.isMobile,
        active: !!account.active,
      });
    });

    return wallets;
  },

  [GettersTypes.GET_QR]({ qr }): Nullable<string> {
    return qr;
  },

  [GettersTypes.getShowWarningNetwork]:
    ({ hiddenWarningNetworks }) =>
    (networkName: string) => {
      return hiddenWarningNetworks.includes(networkName);
    },

  [GettersTypes.getIsCustomSort]:
    ({ isCustomSort }) =>
    (address: string) => {
      return isCustomSort[address] ?? false;
    },

  [GettersTypes.showSoraCardBanner]({ showSoraCardBanner }, getters): boolean {
    const features = getters?.features as Nullable<Features>;
    const soraCard = features?.fiat?.soraCard;

    return !!soraCard && showSoraCardBanner;
  },
};

export default getters;
