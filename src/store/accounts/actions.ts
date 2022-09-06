import { MutationTypes } from './mutations';
import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from './mutations';
import type { State } from './state';
import type { SetSelectedFiat, SetSelectedWallet } from './types';
import type { Currencies } from '@/interfaces/currencies';
import { defaultSortingCurrencies } from '@/util/currenciesHelper';
import { accountController } from '@/controllers/accountController';

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
  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit }, { fiatName }) {
    const currencies: Currencies = rootState.networks.currencies;

    commit(MutationTypes.SET_SELECTED_FIAT, {
      fiatName,
      currencies,
    });
  },

  async [ActionTypes.SET_SELECTED_WALLET]({ rootState, commit, state }, { selectedWalletAddress }) {
    commit(MutationTypes.SET_SELECTED_WALLET, {
      selectedWalletAddress,
    });

    // TODO: try to get rid of setTimeout
    setTimeout(() => {
      const currencies: Currencies = defaultSortingCurrencies(rootState.networks.currencies, state.selectedWallet);
      const sequence = currencies.map(({ token }) => token);

      accountController.setSequenceTokens(sequence, selectedWalletAddress);
    }, 1000);
  },
};

export default actions;
