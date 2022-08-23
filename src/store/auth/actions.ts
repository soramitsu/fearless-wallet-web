import type { ActionTree, ActionContext } from 'vuex';
import type { State } from './state';
import { Mutations } from './mutations';

export enum ActionTypes {
  SUBSCRIBE_TO_DAPP_EVENTS = 'SUBSCRIBE_TO_DAPP_EVENTS',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_TO_DAPP_EVENTS](context: AugmentedActionContext, props: string): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_TO_DAPP_EVENTS](state, payload) {
    console.log(payload);
  },
};

export default actions;
