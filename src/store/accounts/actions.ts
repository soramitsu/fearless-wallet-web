import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';
import type { SetSelectedFiat, SetSelectedWallet } from './types';
import type { Currencies } from '@/interfaces';
import { MutationTypes } from '@/store/accounts/mutations';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';

export enum ActionTypes {
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_FIAT](context: AugmentedActionContext, props: SetSelectedFiat): Promise<void>;
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedActionContext, props: SetSelectedWallet): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit, dispatch }, { fiatName }) {
    const currencies: Currencies = rootState.networks.currencies;

    await dispatch(NetworksActionTypes.FETCH_ASSETS_PRICE, fiatName);

    commit(MutationTypes.SET_SELECTED_FIAT, {
      fiatName,
      currencies,
    });
  },

  async [ActionTypes.SET_SELECTED_WALLET]({ commit }, { selectedWalletAddress }) {
    commit(MutationTypes.SET_SELECTED_WALLET, {
      selectedWalletAddress,
    });
  },
};

export default actions;
