import type { State } from '@/store/soraCard/state';
import type { ActionTree } from 'vuex';
import type { AugmentedSoraCardContext } from './types';
import { initPayWingsAuthSdk } from '@/util/soraCard';
import { MutationTypes } from '@/store/soraCard/mutations';

export enum ActionTypes {
  INIT_AUTH_LOGIN = 'INIT_AUTH_LOGIN',
}

export type Actions = {
  [ActionTypes.INIT_AUTH_LOGIN](store: AugmentedSoraCardContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.INIT_AUTH_LOGIN]({ commit }) {
    const setAuthLogin = (login: any) => commit(MutationTypes.SET_AUTH_LOGIN, login);

    await initPayWingsAuthSdk(setAuthLogin);
  },
};

export default actions;
