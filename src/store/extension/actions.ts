import {
  AuthorizeRequest,
  ApproveAuthRequest,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from '@/store/extension/state';
import { Mutations, MutationTypes } from '@/store/extension/mutations';
import {
  subscribeAuthorizeRequests,
  approveAuthRequest,
  deleteAuthRequest,
  getAuthList,
  removeAuthorization,
  approveMetaRequest,
  rejectMetaRequest,
  subscribeMetadataRequests,
  cancelSignRequest,
  subscribeSigningRequests,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';
import SignController from '@/controllers/signController';
import { SubstrateSignPayloadResponse } from '@/interfaces';

export enum ActionTypes {
  SUBSCRIBE_AUTH_REQUESTS = 'SUBSCRIBE_AUTH_REQUESTS',
  APPROVE_AUTH_REQUEST = 'APPROVE_AUTH_REQUEST',
  REJECT_AUTH_REQUEST = 'REJECT_AUTH_REQUEST',
  GET_AUTHLIST = 'GET_AUTHLIST',
  DELETE_AUTH_CONNECTION = 'DELETE_AUTH_CONNECTION',

  SUBSCRIBE_SIGN_REQUESTS = 'SUBSCRIBE_SIGN_REQUESTS',
  SIGN_CANCEL = 'SIGN_CANCEL',
  APPROVE_SIGN_PASSWORD = 'APPROVE_SIGN_PASSWORD',
  SIGN_SIGNATURE = 'SIGN_SIGNATURE',

  SUBSCRIBE_METADATA_REQUESTS = 'SUBSCRIBE_METADATA_REQUESTS',
  APPROVE_METADATA_REQUEST = 'APPROVE_METADATA_REQUEST',
  REJECT_METADATA_REQUEST = 'REJECT_METADATA_REQUEST',
}

export type ApprovePayload = {
  id: string;
  isSavePass: boolean;
  password?: string;
};

type SignPayload = {
  payload: SubstrateSignPayloadResponse['blockchainData'];
  id: string;
};

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_AUTH_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_AUTH_REQUEST](context: AugmentedActionContext, props: ApproveAuthRequest): Promise<void>;
  [ActionTypes.REJECT_AUTH_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](context: AugmentedActionContext, props: string): Promise<void>;

  [ActionTypes.SUBSCRIBE_METADATA_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.APPROVE_METADATA_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;
  [ActionTypes.REJECT_METADATA_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;

  [ActionTypes.SUBSCRIBE_SIGN_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.SIGN_CANCEL](context: AugmentedActionContext, id: string): Promise<void>;
  [ActionTypes.APPROVE_SIGN_PASSWORD](context: AugmentedActionContext, payload: ApprovePayload): Promise<void>;
  [ActionTypes.SIGN_SIGNATURE](context: AugmentedActionContext, payload: SignPayload): Promise<void>;
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

    commit(MutationTypes.DELETE_REQUEST, 'auth');
  },

  async [ActionTypes.REJECT_AUTH_REQUEST]({ commit }, payload) {
    await deleteAuthRequest(payload.id);

    commit(MutationTypes.DELETE_REQUEST, 'auth');
  },

  async [ActionTypes.GET_AUTHLIST]({ commit }) {
    const list = await getAuthList();

    commit(MutationTypes.SET_AUTHLIST, list);
  },

  async [ActionTypes.DELETE_AUTH_CONNECTION]({ commit }, id) {
    await removeAuthorization(id);

    commit(MutationTypes.DELETE_AUTHLIST_ITEM, id);
  },

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

    commit(MutationTypes.DELETE_REQUEST, 'meta');
  },

  async [ActionTypes.REJECT_METADATA_REQUEST]({ commit }, payload) {
    await rejectMetaRequest(payload.id);
    commit(MutationTypes.DELETE_REQUEST, 'meta');
  },

  async [ActionTypes.SUBSCRIBE_SIGN_REQUESTS]({ commit }) {
    const callback = (requests: SigningRequest[]) => {
      const [request] = requests;

      if (request) {
        commit(MutationTypes.SET_SIGN_REQUEST, request);

        router.push({
          name: Components.Transaction,
        });
      }
    };

    subscribeSigningRequests(callback);
  },

  async [ActionTypes.APPROVE_SIGN_PASSWORD]({ commit }, { id, isSavePass, password }) {
    SignController.approveSignPassword(id, isSavePass, password);

    commit(MutationTypes.DELETE_REQUEST, 'sign');

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_SIGNATURE]({ commit }, { payload, id }) {
    SignController.approveSignSignature(id, payload.signature);

    commit(MutationTypes.DELETE_REQUEST, 'sign');

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_CANCEL]({ commit }, id) {
    await cancelSignRequest(id);
    commit(MutationTypes.DELETE_REQUEST, 'sign');

    router.push({ name: Components.Wallet });
  },
};

export default actions;
