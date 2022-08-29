import type { ActionTree, ActionContext } from 'vuex';
import type { State } from './types';
import { Mutations, MutationTypes } from './mutations';
import {
  subscribeAuthorizeRequests,
  subscribeAccounts,
  approveAuthRequest,
  deleteAuthRequest,
  getAuthList,
  removeAuthorization,
  updateAuthorization,
} from '@/extension/messaging';
import { AuthorizeRequest } from '@polkadot/extension-base/background/types';
import router from '@/router';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';

export enum ActionTypes {
  SUBSCRIBE_TO_DAPP_EVENTS = 'SUBSCRIBE_TO_DAPP_EVENTS',
  APPROVE_REQUEST = 'APPROVE_AUTH_REQUEST',
  REJECT_REQUEST = 'REJECT_AUTH_REQUEST',
  GET_AUTHLIST = 'GET_AUTHLIST',
  DELETE_AUTH_CONNECTION = 'DELETE_AUTH_CONNECTION',
  UPDATE_AUTH_CONNECTION = 'UPDATE_AUTH_CONNECTION',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_TO_DAPP_EVENTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.REJECT_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.UPDATE_AUTH_CONNECTION](
    context: AugmentedActionContext,
    payload: AuthorizeRequest['url']
  ): Promise<void>;
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
  async [ActionTypes.APPROVE_REQUEST]({ commit }, payload) {
    const adresses = BaseApi.getPolkadotAddresses();
    await approveAuthRequest(payload.id, adresses); // add real accounts
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
    await removeAuthorization(id);
    commit(MutationTypes.DELETE_AUTHLIST_ITEM, id);
  },
  async [ActionTypes.UPDATE_AUTH_CONNECTION](state, id) {
    const accounts = BaseApi.getPolkadotAddresses();
    if (state.getters.getAuthList[id].isAllowed) await updateAuthorization(accounts, id);
    else await updateAuthorization([], id);

    state.commit(MutationTypes.TOGGLE_AUTH_STATE, id);
  },
};

export default actions;
