import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';
import { MutationTypes } from '@/store/accounts/mutations';
import { AccountJson } from '@/extension/background/extension-base/src/background/types/types';
import { accountController } from '@/controllers/accountController';
import { getPrice, updateFiatSymbol } from '@/extension/messaging';

export enum ActionTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedActionContext, props: AccountJson | undefined): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SET_SELECTED_WALLET]({ commit }, account) {
    accountController.setSelectedWalletAddress(account?.address);

    commit(MutationTypes.SET_SELECTED_WALLET, {
      address: account?.address ?? '',
      ethereumAddress: account?.ethereumAddress ?? '',
      name: account?.name ?? '',
    });
  },
};

export default actions;
