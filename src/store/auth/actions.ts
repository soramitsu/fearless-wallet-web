import { AuthorizeRequest } from '@extension-base/background/types';
import { Mutations, MutationTypes } from './mutations';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from './state';
import {
  subscribeAuthorizeRequests,
  approveAuthRequest,
  deleteAuthRequest,
  getAuthList,
  removeAuthorization,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';

export enum ActionTypes {
  SUBSCRIBE_AUTH_REQUESTS = 'SUBSCRIBE_AUTH_REQUESTS',
  APPROVE_AUTH_REQUEST = 'APPROVE_AUTH_REQUEST',
  REJECT_AUTH_REQUEST = 'REJECT_AUTH_REQUEST',
  GET_AUTHLIST = 'GET_AUTHLIST',
  DELETE_AUTH_CONNECTION = 'DELETE_AUTH_CONNECTION',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_AUTH_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_AUTH_REQUEST](
    context: AugmentedActionContext,
    props: { request: AuthorizeRequest; accounts: string[] }
  ): Promise<void>;
  [ActionTypes.REJECT_AUTH_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](context: AugmentedActionContext, props: string): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_AUTH_REQUESTS]({ commit }) {
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

  async [ActionTypes.APPROVE_AUTH_REQUEST]({ commit }, { request, accounts }) {
    await approveAuthRequest(request.id, accounts);

    commit(MutationTypes.DELETE_AUTH_REQUEST);
  },

  async [ActionTypes.REJECT_AUTH_REQUEST]({ commit }, payload) {
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
};

export default actions;
