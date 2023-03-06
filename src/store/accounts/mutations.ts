import type { MutationTree } from 'vuex';
import type {
  SetSelectedWalletProps,
  SetSelectedFiatProps,
  SetSelectedNetworkProps,
  setAccountsProps,
  setAutoSelectNode,
  setOnlineStatus,
} from './types';
import type { State } from './state';
import { accountController } from '@/controllers/accountController';
import { BalanceJson } from '@/extension/background/extension-base/src/background/types';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ONLINE_STATUS = 'SET_ONLINE_STATUS',
  SET_CUSTOM_SORT = 'SET_CUSTOM_SORT',
  SET_AUTO_SELECT_NODE = 'SET_AUTO_SELECT_NODE',
  SET_QR = 'SET_QR',
  SET_BALANCE = 'SET_BALANCE',
  DELETE_QR = 'DELETE_QR',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SetSelectedWalletProps): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: SetSelectedFiatProps): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, props: SetSelectedNetworkProps): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: setAccountsProps): void;
  [MutationTypes.SET_ONLINE_STATUS](state: State, props: setOnlineStatus): void;
  [MutationTypes.SET_BALANCE](state: State, props: BalanceJson): void;
  [MutationTypes.SET_AUTO_SELECT_NODE](state: State, props: setAutoSelectNode): void;
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.DELETE_QR](state: State): void;
  [MutationTypes.SET_CUSTOM_SORT](state: State, props: string): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWallet }) {
    state.selectedWallet = {
      address: selectedWallet.address,
      ethereumAddress: selectedWallet.ethereumAddress ?? '',
      name: selectedWallet.name ?? '',
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, { fiatName, currencies }) {
    accountController.setSelectedFiat(fiatName);

    state.selectedFiat = fiatName;

    currencies.forEach((currency) => currency.updatePrice());
  },

  [MutationTypes.SET_SELECTED_NETWORK](state, { network }) {
    const {
      selectedWallet: { address },
      selectedNetworks,
    } = state;

    accountController.setSelectedNetwork(address, network);

    state.selectedNetworks = { ...selectedNetworks, [address]: network };
  },

  [MutationTypes.SET_ONLINE_STATUS](state, { isOnline }) {
    state.isOnline = isOnline;
  },

  [MutationTypes.SET_ACCOUNTS](state, { accounts }) {
    state.accounts = [...accounts];

    accountController.setAccounts(accounts);
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

  [MutationTypes.SET_CUSTOM_SORT](state, address: string) {
    accountController.setCustomSort(address);

    state.isCustomSort = {
      ...state.isCustomSort,
      [address]: true,
    };
  },

  [MutationTypes.SET_BALANCE](state, payload) {
    state.balances = payload.details;
  },
};

export default mutations;
