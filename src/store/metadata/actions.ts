import { MetadataRequest } from '@extension-base/background/types';
import { Mutations, MutationTypes } from './mutations';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from './state';
import { subscribeMetadataRequests, approveMetaRequest, rejectMetaRequest } from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';

export enum ActionTypes {
  SUBSCRIBE_METADATA_REQUESTS = 'SUBSCRIBE_METADATA_REQUESTS',
  APPROVE_METADATA_REQUEST = 'APPROVE_METADATA_REQUEST',
  REJECT_METADATA_REQUEST = 'REJECT_METADATA_REQUEST',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_METADATA_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_METADATA_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;
  [ActionTypes.REJECT_METADATA_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_METADATA_REQUESTS]({ commit }) {
    const callback = (requests: MetadataRequest[]) => {
      const [request] = requests;

      if (request && request.id) {
        commit(MutationTypes.SET_METADATA_REQUEST, request);

        router.push({
          name: Components.MetaRequest,
        });
      }
    };

    subscribeMetadataRequests(callback);
  },

  async [ActionTypes.APPROVE_METADATA_REQUEST]({ commit }, payload) {
    await approveMetaRequest(payload.id);

    commit(MutationTypes.DELETE_METADATA_REQUEST);
  },

  async [ActionTypes.REJECT_METADATA_REQUEST]({ commit }, payload) {
    await rejectMetaRequest(payload.id);
    commit(MutationTypes.DELETE_METADATA_REQUEST);
  },
};

export default actions;
