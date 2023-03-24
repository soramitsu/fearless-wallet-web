import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import type { MutationTree } from 'vuex';
import type { SetSelectedFiatProps, SetAccountsProps, SetAddressesProps, SetAutoSelectNode } from './types';
import type { State } from './state';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import BaseApi from '@/util/BaseApi';
import { accountController } from '@/controllers';
import { getMetaTyped } from '@/helpers/common';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ONLINE_STATUS = 'SET_ONLINE_STATUS',
  SET_ADDRESSES = 'SET_ADDRESSES',
  SET_CUSTOM_SORT = 'SET_CUSTOM_SORT',
  SET_AUTO_SELECT_NODE = 'SET_AUTO_SELECT_NODE',
  SET_QR = 'SET_QR',
  DELETE_QR = 'DELETE_QR',
  HIDE_POLKASWAP_ALERT = 'HIDE_POLKASWAP_ALERT',
  HIDE_NETWORK_WARNING = 'HIDE_NETWORK_WARNING',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, selectedWalletAddress: string): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: SetSelectedFiatProps): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, network: string): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: SetAccountsProps): void;
  [MutationTypes.SET_ONLINE_STATUS](state: State, isOnline: boolean): void;
  [MutationTypes.SET_ADDRESSES](state: State, props: SetAddressesProps): void;
  [MutationTypes.SET_AUTO_SELECT_NODE](state: State, props: SetAutoSelectNode): void;
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.DELETE_QR](state: State): void;
  [MutationTypes.SET_CUSTOM_SORT](state: State, props: string): void;
  [MutationTypes.HIDE_POLKASWAP_ALERT](state: State, value: boolean): void;
  [MutationTypes.HIDE_NETWORK_WARNING](state: State, network: string): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, selectedWalletAddress) {
    let meta: KeyringPair$Meta | KeyringJson$Meta;

    if (BaseApi.getWalletType(selectedWalletAddress) === 'native') meta = BaseApi.getPair(selectedWalletAddress).meta;
    else {
      const address = BaseApi.getAddress(selectedWalletAddress);

      if (!address) return;

      meta = address.meta;
    }

    const { name, ethereumAddress } = getMetaTyped(meta);
    accountController.setSelectedWalletAddress(selectedWalletAddress);

    state.selectedWallet = {
      address: selectedWalletAddress,
      ethereumAddress: ethereumAddress ?? '',
      name,
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, { fiatName, currencies }) {
    accountController.setSelectedFiat(fiatName);

    state.selectedFiat = fiatName;

    currencies.forEach((currency) => currency.updatePrice());
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

  [MutationTypes.SET_ACCOUNTS](state, { accounts }) {
    state.accounts = accounts;
  },

  [MutationTypes.HIDE_POLKASWAP_ALERT](state) {
    state.showPolkaswapAlert = false;

    accountController.setAgreeSwapDisclaimer();
  },

  [MutationTypes.SET_ADDRESSES](state, { addresses }) {
    state.addresses = addresses;
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

  [MutationTypes.SET_CUSTOM_SORT](state, address: string) {
    accountController.setCustomSort(address);

    state.isCustomSort = {
      ...state.isCustomSort,
      [address]: true,
    };
  },
};

export default mutations;
