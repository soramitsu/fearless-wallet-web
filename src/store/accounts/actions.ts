import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';
import type { SetSelectedFiat, SetSelectedWallet } from './types';
import type { Currencies } from '@/interfaces';
import { MutationTypes } from '@/store/accounts/mutations';
import { BalanceJson } from '@/extension/background/extension-base/src/background/types';

export enum ActionTypes {
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_BALANCE = 'SET_BALANCE',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_FIAT](context: AugmentedActionContext, props: SetSelectedFiat): Promise<void>;
  [ActionTypes.SET_BALANCE](context: AugmentedActionContext, props: BalanceJson): Promise<void>;
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedActionContext, props: SetSelectedWallet): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_BALANCE]({ commit }, payload) {
    commit(MutationTypes.SET_BALANCE, payload);
  },

  async [ActionTypes.SET_SELECTED_FIAT]({ rootState, commit }, { fiatName }) {
    const currencies: Currencies = rootState.networks.currencies;

    commit(MutationTypes.SET_SELECTED_FIAT, {
      fiatName,
      currencies,
    });
  },

  async [ActionTypes.SET_SELECTED_WALLET]({ commit, state }, { selectedWalletAddress }) {
    const account = state.accounts.find((account) => account.address === selectedWalletAddress);

    if (!account) return;

    commit(MutationTypes.SET_SELECTED_WALLET, {
      address: account.address,
      ethereumAddress: account.ethereumAddress,
      name: account.name ?? '',
    });
  },
};

export default actions;
