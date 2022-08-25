import type { ActionTree, ActionContext } from 'vuex';
import type { State } from './types';
import { Mutations, MutationTypes } from './mutations';
import {
  subscribeAuthorizeRequests,
  approveAuthRequest,
  deleteAuthRequest,
  getAuthList,
  removeAuthorization,
} from '@/extension/messaging';
import { AuthorizeRequest } from '@polkadot/extension-base/background/types';
import router from '@/router';
import { Components } from '@/router/routes';

export enum ActionTypes {
  SUBSCRIBE_TO_DAPP_EVENTS = 'SUBSCRIBE_TO_DAPP_EVENTS',
  APPROVE_REQUEST = 'APPROVE_REQUEST',
  REJECT_REQUEST = 'REJECT_REQUEST',
  GET_AUTHLIST = 'GET_AUTHLIST',
  DELETE_AUTH_CONNECTION = 'DELETE_AUTH_CONNECTION',
  DECLINE_AUTH_CONNECTION = 'DECLINE_AUTH_CONNECTION',
  ALLOW_AUTH_CONNECTION = 'ALLOW_AUTH_CONNECTION',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_TO_DAPP_EVENTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.REJECT_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](
    context: AugmentedActionContext,
    payload: AuthorizeRequest['url']
  ): Promise<void>;
  [ActionTypes.DECLINE_AUTH_CONNECTION](
    context: AugmentedActionContext,
    payload: AuthorizeRequest['url']
  ): Promise<void>;
  [ActionTypes.ALLOW_AUTH_CONNECTION](context: AugmentedActionContext, payload: AuthorizeRequest['url']): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_TO_DAPP_EVENTS]({ commit }) {
    const callback = (requests: AuthorizeRequest[]) => {
      const [request] = requests;
      if (request) {
        commit(MutationTypes.SET_AUTH_REQUEST, request);

        router.push({
          name: Components.Authorize,
        });
      }
    };
    subscribeAuthorizeRequests(callback);
  },
  async [ActionTypes.APPROVE_REQUEST]({ commit, rootGetters }, payload) {
    const wallet = rootGetters.getSelectedWallet;
    await approveAuthRequest(payload.id, [wallet.address]); // add real accounts
    commit(MutationTypes.DELETE_AUTH_REQUEST);
  },
  async [ActionTypes.REJECT_REQUEST]({ commit }, payload) {
    await deleteAuthRequest(payload.id);
    commit(MutationTypes.DELETE_AUTH_REQUEST);
  },
  async [ActionTypes.GET_AUTHLIST]({ commit }) {
    const list = await getAuthList();
    commit(MutationTypes.SET_AUTHLIST, list);
  },
  async [ActionTypes.DELETE_AUTH_CONNECTION]({ commit }, id) {
    const list = await removeAuthorization(id);
    commit(MutationTypes.SET_AUTHLIST, list);
    commit(MutationTypes.DELETE_AUTHLIST_ITEM, id);
  },
  async [ActionTypes.DECLINE_AUTH_CONNECTION]({ commit }, id) {
    const list = await removeAuthorization(id);
    commit(MutationTypes.SET_AUTHLIST, list);
    commit(MutationTypes.DELETE_AUTHLIST_ITEM, id);
  },
  async [ActionTypes.ALLOW_AUTH_CONNECTION]({ commit }, payload) {
    const list = await removeAuthorization(payload);
    commit(MutationTypes.SET_AUTHLIST, list);
  },
};

export default actions;
