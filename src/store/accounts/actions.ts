import type { ActionTree, ActionContext } from 'vuex';
import type { Mutations } from './mutations';
import type { State } from './state';

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
    console.info('test');
  },
};

export default actions;
