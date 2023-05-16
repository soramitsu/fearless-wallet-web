import type { MutationTree } from 'vuex';
import type { SelectedWallet, SetAccountsProps, SetAutoSelectNode } from './types';
import type { State } from './state';
import { accountController } from '@/controllers';
import { BalanceJson } from '@/extension/background/extension-base/src/background/types/types';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ONLINE_STATUS = 'SET_ONLINE_STATUS',
  SET_ADDRESSES = 'SET_ADDRESSES',
  SET_CUSTOM_SORT = 'SET_CUSTOM_SORT',
  SET_AUTO_SELECT_NODE = 'SET_AUTO_SELECT_NODE',
  SET_HIDDEN_ASSET = 'SET_HIDDEN_ASSET',
  DELETE_HIDDEN_ASSET = 'DELETE_HIDDEN_ASSET',
  SET_QR = 'SET_QR',
  DELETE_QR = 'DELETE_QR',
  HIDE_POLKASWAP_ALERT = 'HIDE_POLKASWAP_ALERT',
  HIDE_NETWORK_WARNING = 'HIDE_NETWORK_WARNING',
  SET_BALANCE = 'SET_BALANCE',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SelectedWallet): void;
  [MutationTypes.SET_BALANCE](state: State, props: BalanceJson): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: string): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, network: string): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: SetAccountsProps): void;
  [MutationTypes.SET_ONLINE_STATUS](state: State, isOnline: boolean): void;
  [MutationTypes.SET_AUTO_SELECT_NODE](state: State, props: SetAutoSelectNode): void;
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.DELETE_QR](state: State): void;
  [MutationTypes.SET_HIDDEN_ASSET](state: State, props: string): void;
  [MutationTypes.DELETE_HIDDEN_ASSET](state: State, props: string): void;
  [MutationTypes.SET_CUSTOM_SORT](state: State, props: string): void;
  [MutationTypes.HIDE_POLKASWAP_ALERT](state: State, value: boolean): void;
  [MutationTypes.HIDE_NETWORK_WARNING](state: State, network: string): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, account) {
    state.selectedWallet = {
      address: account.address,
      ethereumAddress: account.ethereumAddress,
      name: account.name ?? '',
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, fiatName) {
    accountController.setSelectedFiat(fiatName);

    state.selectedFiat = fiatName;
  },

  [MutationTypes.SET_SELECTED_NETWORK](state, network) {
    const {
      selectedWallet: { address },
      selectedNetworks,
    } = state;

    accountController.setSelectedNetwork(address, network);

    state.selectedNetworks = { ...selectedNetworks, [address]: network };
  },

  [MutationTypes.SET_ONLINE_STATUS](state, isOnline) {
    state.isOnline = isOnline;
  },

  [MutationTypes.SET_ACCOUNTS](state, { accounts, isMobileUpdate }) {
    const mobileIndex = state.accounts.findIndex((account) => account.isMobile);
    const isMobileWalletExists = mobileIndex >= 0;

    if (!accounts.length) {
      if (isMobileUpdate && isMobileWalletExists) state.accounts.splice(mobileIndex);

      state.accounts = [];

      return;
    }

    if (isMobileWalletExists) state.accounts[mobileIndex] = accounts[0];
    else state.accounts.push(accounts[0]);

    accountController.setAccounts(state.accounts);

    if (isMobileWalletExists) state.accounts = [state.accounts[mobileIndex], ...accounts];
    else state.accounts = [...accounts];

    accountController.setAccounts(state.accounts);
  },

  [MutationTypes.HIDE_POLKASWAP_ALERT](state) {
    state.showPolkaswapAlert = false;

    accountController.setAgreeSwapDisclaimer();
  },

  [MutationTypes.SET_AUTO_SELECT_NODE](state, { network, value }) {
    accountController.setAutoSelectNodes(value, network);

    state.autoSelectNode = { ...state.autoSelectNode, [network]: value };
  },

  [MutationTypes.SET_QR](state, payload) {
    state.qr = payload;
  },

  [MutationTypes.DELETE_QR](state) {
    state.qr = null;
  },

  [MutationTypes.HIDE_NETWORK_WARNING](state, network) {
    const { hideWarningNetworks } = state;

    accountController.setHideWarningNetwork(network);

    state.hideWarningNetworks = [...hideWarningNetworks, network];
  },

  [MutationTypes.HIDE_NETWORK_WARNING](state, network) {
    const { hideWarningNetworks } = state;

    accountController.setHideWarningNetwork(network);

    state.hideWarningNetworks = [...hideWarningNetworks, network];
  },

  [MutationTypes.SET_CUSTOM_SORT](state, address: string) {
    accountController.setCustomSort(address);

    state.isCustomSort = {
      ...state.isCustomSort,
      [address]: true,
    };
  },

  [MutationTypes.SET_BALANCE](state, { details, reset }) {
    console.info('[SET_BALANCE]', details, reset);

    state.balances = details;
  },

  [MutationTypes.SET_HIDDEN_ASSET](state, payload) {
    if (state.hiddenAssets.find((el) => el === payload)) return;
    state.hiddenAssets.push(payload);
  },

  [MutationTypes.DELETE_HIDDEN_ASSET](state, payload) {
    const index = state.hiddenAssets.findIndex((el) => el === payload);

    if (index >= 0) state.hiddenAssets.splice(index, 1);
  },
};

export default mutations;
