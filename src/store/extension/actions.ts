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
  isTabAuthorize,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';
import ExtensionController from '@/controllers/extensionController';
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

  SUBSCRIBE_META_REQUESTS = 'SUBSCRIBE_META_REQUESTS',
  APPROVE_META_REQUEST = 'APPROVE_META_REQUEST',
  REJECT_META_REQUEST = 'REJECT_META_REQUEST',
  SUBSCRIBE_EXTENSION_REQUESTS = 'SUBSCRIBE_EXTENSION_REQUESTS',
  FETCH_TAB_STATUS = 'FETCH_TAB_STATUS',
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
  [ActionTypes.SUBSCRIBE_AUTH_REQUESTS](context: AugmentedActionContext): Promise<boolean>;
  [ActionTypes.APPROVE_AUTH_REQUEST](context: AugmentedActionContext, props: ApproveAuthRequest): Promise<void>;
  [ActionTypes.REJECT_AUTH_REQUEST](context: AugmentedActionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](context: AugmentedActionContext, props: string): Promise<void>;

  [ActionTypes.SUBSCRIBE_META_REQUESTS](context: AugmentedActionContext): Promise<boolean>;
  [ActionTypes.APPROVE_META_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;
  [ActionTypes.REJECT_META_REQUEST](context: AugmentedActionContext, props: MetadataRequest): Promise<void>;

  [ActionTypes.SUBSCRIBE_SIGN_REQUESTS](context: AugmentedActionContext): Promise<boolean>;
  [ActionTypes.SIGN_CANCEL](context: AugmentedActionContext, id: string): Promise<void>;
  [ActionTypes.APPROVE_SIGN_PASSWORD](context: AugmentedActionContext, payload: ApprovePayload): Promise<void>;
  [ActionTypes.SIGN_SIGNATURE](context: AugmentedActionContext, payload: SignPayload): Promise<void>;
  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS](context: AugmentedActionContext): Promise<void[]>;

  [ActionTypes.FETCH_TAB_STATUS](context: AugmentedActionContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_AUTH_REQUESTS]({ commit }) {
    const callback = (requests: AuthorizeRequest[]) => {
      const [request] = requests;

      if (request) {
        commit(MutationTypes.SET_REQUEST, { type: 'auth', data: request });

        router.push({
          name: Components.Authorize,
        });
      }
    };

    return subscribeAuthorizeRequests(callback);
  },

  async [ActionTypes.APPROVE_AUTH_REQUEST]({ commit, dispatch }, { request, accounts }) {
    await approveAuthRequest(request.id, accounts);

    commit(MutationTypes.DELETE_REQUEST, 'auth');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.REJECT_AUTH_REQUEST]({ commit, dispatch }, payload) {
    await deleteAuthRequest(payload.id);

    commit(MutationTypes.DELETE_REQUEST, 'auth');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.GET_AUTHLIST]({ commit }) {
    const list = await getAuthList();

    commit(MutationTypes.SET_AUTHLIST, list);
  },

  async [ActionTypes.DELETE_AUTH_CONNECTION]({ commit }, id) {
    await removeAuthorization(id);

    commit(MutationTypes.DELETE_AUTHLIST_ITEM, id);
  },

  async [ActionTypes.SUBSCRIBE_META_REQUESTS]({ commit }) {
    const callback = (requests: MetadataRequest[]) => {
      const [request] = requests;

      if (request && request.id) {
        commit(MutationTypes.SET_REQUEST, { type: 'meta', data: request });

        router.push({
          name: Components.MetaRequest,
        });
      }
    };

    return subscribeMetadataRequests(callback);
  },

  async [ActionTypes.APPROVE_META_REQUEST]({ commit, dispatch }, payload) {
    await approveMetaRequest(payload.id);

    commit(MutationTypes.DELETE_REQUEST, 'meta');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.REJECT_META_REQUEST]({ commit, dispatch }, payload) {
    await rejectMetaRequest(payload.id);
    commit(MutationTypes.DELETE_REQUEST, 'meta');
    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.SUBSCRIBE_SIGN_REQUESTS]({ commit }) {
    const callback = (requests: SigningRequest[]) => {
      const [request] = requests;

      if (request) {
        commit(MutationTypes.SET_REQUEST, { type: 'sign', data: request });

        router.push({
          name: Components.Transaction,
        });
      }
    };

    return subscribeSigningRequests(callback);
  },

  async [ActionTypes.APPROVE_SIGN_PASSWORD]({ commit, dispatch }, { id, isSavePass, password }) {
    ExtensionController.approveSignPassword(id, isSavePass, password);

    commit(MutationTypes.DELETE_REQUEST, 'sign');

    router.push({ name: Components.Wallet });

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.SIGN_SIGNATURE]({ commit, dispatch }, { payload, id }) {
    ExtensionController.approveSignSignature(id, payload.signature);

    commit(MutationTypes.DELETE_REQUEST, 'sign');

    dispatch(ActionTypes.FETCH_TAB_STATUS);

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_CANCEL]({ commit }, id) {
    await cancelSignRequest(id);
    commit(MutationTypes.DELETE_REQUEST, 'sign');

    router.push({ name: Components.Wallet });
  },

  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS]({ dispatch }) {
    const auth = dispatch(ActionTypes.SUBSCRIBE_AUTH_REQUESTS);
    const sign = dispatch(ActionTypes.SUBSCRIBE_SIGN_REQUESTS);
    const meta = dispatch(ActionTypes.SUBSCRIBE_META_REQUESTS);

    return Promise.all([auth, sign, meta]);
  },

  async [ActionTypes.FETCH_TAB_STATUS]({ commit }) {
    const tabStatus = await isTabAuthorize();

    commit(MutationTypes.SET_TABSTATUS, tabStatus);
  },
};

export default actions;
