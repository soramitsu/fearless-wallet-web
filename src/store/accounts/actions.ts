import { ActionTree, ActionContext } from 'vuex';
import { Mutations } from './mutations';

import { State } from './state';

export enum ActionTypes {
  TEST = 'TEST',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, State>, 'commit'>;

export type Actions = {
  [ActionTypes.TEST]({ commit }: AugmentedActionContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.TEST]({ commit }) {
    console.log('test');
  },
};

export default actions;
