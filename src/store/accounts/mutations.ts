import type { MutationTree } from 'vuex';
import type { SetSelectedWalletProps, SetSelectedFiatProps, setAccountsProps } from './types';
import type { State } from './state';
import BaseApi from '@/util/BaseApi';
import { accountController } from '@/controllers/accountController';
import { getMetaTyped } from '@/util/helpers';
import { defaultSortingCurrencies } from '@/util/currenciesHelper';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SetSelectedWalletProps): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: SetSelectedFiatProps): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: setAccountsProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWalletAddress }) {
    const { meta } = BaseApi.getPair(selectedWalletAddress);
    const { name, ethereumAddress } = getMetaTyped(meta);

    accountController.setSelectedWalletAddress(selectedWalletAddress);

    state.selectedWallet = {
      address: selectedWalletAddress,
      ethereumAddress,
      name,
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, { fiatName, currencies }) {
    accountController.setSelectedFiat(fiatName);

    currencies.forEach((currency) => currency.updatePrice(fiatName));

    state.selectedFiat = fiatName;
  },

  [MutationTypes.SET_ACCOUNTS](state, { accounts }) {
    state.accounts = accounts;
  },
};

export default mutations;
