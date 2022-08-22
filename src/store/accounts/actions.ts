import { MutationTypes } from './mutations';
import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from './mutations';
import type { State } from './state';
import type { SetSelectedFiat } from './types';
import type { Currencies } from '@/interfaces/currencies';

export enum ActionTypes {
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_FIAT](context: AugmentedActionContext, props: SetSelectedFiat): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit }, { fiatName }) {
    const currencies: Currencies = rootState.networks.currencies;

    commit(MutationTypes.SET_SELECTED_FIAT, {
      fiatName,
      currencies,
    });
  },
};

export default actions;
