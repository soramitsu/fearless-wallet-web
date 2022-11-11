import { IWallet } from './types';
import type { GetterTree } from 'vuex';
import type { SelectedWallet, Accounts, WalletInfo, GetAutoSelectNodesValueByNetwork } from './types';
import type { State } from './state';
import type { FiatJson } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import store from '@/store';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
  getSelectedFiat = 'getSelectedFiat',
  getSelectedNetwork = 'getSelectedNetwork',
  getFiatSymbol = 'getFiatSymbol',
  getOnlineStatus = 'getOnlineStatus',
  getFiatId = 'getFiatId',
  getAccounts = 'getAccounts',
  getAddresses = 'getAddresses',
  getWallets = 'getWallets',
  getAutoSelectNodesValueByNetwork = 'getAutoSelectNodesValueByNetwork',
}

export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getSelectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getSelectedNetwork](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getOnlineStatus](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getFiatId](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getAccounts](state: State, getters?: GetterTree<State, State> & Getters): Accounts;
  [GettersTypes.getAddresses](state: State, getters?: GetterTree<State, State> & Getters): Accounts;
  [GettersTypes.getWallets](state: State, getters?: GetterTree<State, State> & Getters): WalletInfo[];
  [GettersTypes.getAutoSelectNodesValueByNetwork](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetAutoSelectNodesValueByNetwork;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getSelectedWallet]({ selectedWallet }): SelectedWallet {
    return selectedWallet;
  },

  [GettersTypes.getSelectedFiat]({ selectedFiat }): string {
    return selectedFiat;
  },

  [GettersTypes.getSelectedNetwork]({ selectedNetworks, selectedWallet: { address } }): string {
    return selectedNetworks[address] ?? 'all';
  },

  [GettersTypes.getOnlineStatus]({ isOnline }): boolean {
    return isOnline;
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

  [GettersTypes.getAccounts]({ accounts }): Accounts {
    return accounts;
  },

  [GettersTypes.getAddresses]({ addresses }): Accounts {
    return addresses;
  },

  [GettersTypes.getAutoSelectNodesValueByNetwork]:
    ({ autoSelectNode }) =>
    (networkName: string) => {
      return autoSelectNode[networkName] ?? true;
    },

  [GettersTypes.getWallets]({ addresses, accounts }): WalletInfo[] {
    const wallets: WalletInfo[] = [];
    const prepAccounts = { ...addresses, ...accounts };
    (Object.values(prepAccounts) as any).forEach((wallet: IWallet) => {
      if (wallet.type !== 'ethereum')
        wallets.push({
          name: wallet.json.meta.name,
          address: wallet.json.address,
          isMobile: false,
          active: false,
        });
    });

    return wallets;
  },
};

export default getters;
