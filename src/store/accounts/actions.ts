import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';
import type { Currencies } from '@/interfaces';
import { MutationTypes } from '@/store/accounts/mutations';

export enum ActionTypes {
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_FIAT](context: AugmentedActionContext, fiatName: string): Promise<void>;
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedActionContext, address: string): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit }, fiatName) {
    const currencies: Currencies = rootState.networks.currencies;

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
