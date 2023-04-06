import type { ActionTree } from 'vuex';
import type { State } from '@/store/accounts/state';
import type { Currencies } from '@/interfaces';
import type { AugmentedAccountContext } from './types';
import { MutationTypes } from '@/store/accounts/mutations';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';

export enum ActionTypes {
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

export type Actions = {
  [ActionTypes.SET_SELECTED_FIAT](context: AugmentedAccountContext, fiatName: string): Promise<void>;
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedAccountContext, address: string): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit, dispatch }, fiatName) {
    const currencies: Currencies = rootState.networks.currencies;

    await dispatch(NetworksActionTypes.FETCH_ASSETS_PRICE, fiatName);

    commit(MutationTypes.SET_SELECTED_FIAT, {
      fiatName,
      currencies,
    });
  },

  async [ActionTypes.SET_SELECTED_WALLET]({ commit }, address) {
    commit(MutationTypes.SET_SELECTED_WALLET, address);
  },
};

export default actions;
