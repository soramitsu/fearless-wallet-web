import type { GetterTree } from 'vuex';
import type { SelectedWallet, WalletInfo, GetAutoSelectNodesValueByNetwork, GetShowWarningNetworks } from './types';
import type { State } from './state';
import type { FiatJson } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import store from '@/store';
import { AccountJson, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { ALL_NETWORKS } from '@/consts/networks';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
  getSelectedFiat = 'getSelectedFiat',
  getSelectedNetwork = 'getSelectedNetwork',
  getFiatSymbol = 'getFiatSymbol',
  getOnlineStatus = 'getOnlineStatus',
  getFiatId = 'getFiatId',
  getAccounts = 'getAccounts',
  hiddenAssets = 'hiddenAssets',
  getAddresses = 'getAddresses',
  getBalances = 'getBalances',
  getWallets = 'getWallets',
  getAutoSelectNodesValueByNetwork = 'getAutoSelectNodesValueByNetwork',
  GET_QR = 'getQR',
  getIsCustomSort = 'getIsCustomSort',
  showPolkaswapAlert = 'showPolkaswapAlert',
  getShowWarningNetworks = 'getShowWarningNetworks',
}

export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getBalances](state: State, getters?: GetterTree<State, State> & Getters): TokenBalance[];
  [GettersTypes.getSelectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getSelectedNetwork](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getOnlineStatus](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getFiatId](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.hiddenAssets](state: State, getters?: GetterTree<State, State> & Getters): string[];
  [GettersTypes.getAccounts](state: State, getters?: GetterTree<State, State> & Getters): AccountJson[];
  [GettersTypes.getWallets](state: State, getters?: GetterTree<State, State> & Getters): WalletInfo[];
  [GettersTypes.showPolkaswapAlert](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getShowWarningNetworks](
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
  [GettersTypes.getSelectedWallet]({ selectedWallet }): SelectedWallet {
    return selectedWallet;
  },

  [GettersTypes.getBalances]({ balances }): TokenBalance[] {
    return balances;
  },

  [GettersTypes.hiddenAssets]({ selectedWallet, hiddenAssets }): any {
    const { address } = selectedWallet;

    return hiddenAssets[address] ?? [];
  },

  [GettersTypes.getSelectedFiat]({ selectedFiat }): string {
    return selectedFiat;
  },

  [GettersTypes.getSelectedNetwork]({ selectedNetworks, selectedWallet: { address } }): string {
    return selectedNetworks[address] ?? ALL_NETWORKS;
  },

  [GettersTypes.getOnlineStatus](state): boolean {
    return state.isOnline;
  },

  [GettersTypes.showPolkaswapAlert]({ showPolkaswapAlert }): boolean {
    return showPolkaswapAlert;
  },

  [GettersTypes.getFiatSymbol]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.getFiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.symbol ?? '';
  },

  [GettersTypes.getFiatId]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.getFiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.id ?? '';
  },

  [GettersTypes.getAccounts](state): AccountJson[] {
    return state.accounts;
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

  [GettersTypes.getShowWarningNetworks]:
    ({ hideWarningNetworks }) =>
    (networkName: string) => {
      return hideWarningNetworks.includes(networkName);
    },

  [GettersTypes.getIsCustomSort]:
    ({ isCustomSort }) =>
    (address: string) => {
      return isCustomSort[address] ?? false;
    },
};

export default getters;
