import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';
import type { AccountJson, BalanceJson } from '@/extension/background/extension-base/src/background/types/types';
import { MutationTypes } from '@/store/accounts/mutations';
import { accountController } from '@/controllers/accountController';
import router from '@/router';
import { Components } from '@/router/routes';

export enum ActionTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_BALANCE = 'SET_BALANCE',
  ONLINE_STATUS_UPDATE = 'ONLINE_STATUS_UPDATE',
}

type AugmentedAccountContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SET_SELECTED_WALLET](context: AugmentedAccountContext, props: AccountJson | undefined): void;
  [ActionTypes.SET_BALANCE](context: AugmentedAccountContext, props: BalanceJson): Promise<void>;
  [ActionTypes.ONLINE_STATUS_UPDATE](context: AugmentedAccountContext): void;
};

const actions: ActionTree<State, State> & Actions = {
  [ActionTypes.SET_SELECTED_WALLET]({ commit }, account) {
    commit(MutationTypes.SET_SELECTED_WALLET, {
      address: account?.address ?? '',
      ethereumAddress: account?.ethereumAddress ?? '',
      name: account?.name ?? '',
    });

    accountController.setSelectedWalletAddress(account?.address);

    if (
      account === undefined &&
      router.currentRoute.name !== Components.Welcome &&
      router.currentRoute.name !== Components.AddFromGoogle &&
      router.currentRoute.name !== Components.AddWallet
    )
      router.replace('/').catch((e) => e);
  },

  async [ActionTypes.SET_BALANCE]({ commit, state }, { details, reset, saveSequence = false }) {
    if (saveSequence) {
      const address = state.selectedWallet.address;
      const sequence = details.map(({ assetId }) => assetId);

      accountController.setSequenceAssets(sequence, address);

      commit(MutationTypes.SET_CUSTOM_SORT, address);
    }

    commit(MutationTypes.SET_BALANCE, { details, reset });
  },

  [ActionTypes.ONLINE_STATUS_UPDATE]({ commit }) {
    navigator.connection.addEventListener('change', () => {
      commit(MutationTypes.SET_ONLINE_STATUS, navigator.onLine);
    });
  },
};

export default actions;
