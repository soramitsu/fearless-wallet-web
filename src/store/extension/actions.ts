import axios from 'axios';
import {
  RequestApproveConnectWalletSession,
  RequestRejectConnectWalletSession,
} from '@extension-base/services/wallet-connect-service/types';
import { SessionTypes } from '@walletconnect/types';
import type { AuthorizeRequest, ApproveAuthRequest, MetadataRequest } from '@extension-base/background/types/types';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from '@/store/extension/state';
import type { Features } from '@/store/extension/types';
import type { SigningRequest } from '@extension-base/background/types';
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
  approveWalletConnectSession,
  rejectWalletConnectSession,
  walletConnectSessionsSubscribe,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';
import { ExtensionController } from '@/controllers';
import { SubstrateSignPayloadResponse } from '@/interfaces';
import { URLS } from '@/consts/urls';

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

  SUBSCRIBE_WC_REQUESTS = 'SUBSCRIBE_WC_REQUESTS',
  APPROVE_WC_REQUEST = 'APPROVE_WC_REQUEST',
  REJECT_WC_REQUEST = 'REJECT_WC_REQUEST',

  SUBSCRIBE_EXTENSION_REQUESTS = 'SUBSCRIBE_EXTENSION_REQUESTS',
  FETCH_TAB_STATUS = 'FETCH_TAB_STATUS',
  FETCH_FEATURES = 'FETCH_FEATURES',
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

type AugmentedExtensionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_AUTH_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.APPROVE_AUTH_REQUEST](context: AugmentedExtensionContext, props: ApproveAuthRequest): Promise<void>;
  [ActionTypes.REJECT_AUTH_REQUEST](context: AugmentedExtensionContext, props: AuthorizeRequest): Promise<void>;
  [ActionTypes.GET_AUTHLIST](context: AugmentedExtensionContext): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](context: AugmentedExtensionContext, props: string): Promise<void>;

  [ActionTypes.SUBSCRIBE_META_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.APPROVE_META_REQUEST](context: AugmentedExtensionContext, props: MetadataRequest): Promise<void>;
  [ActionTypes.REJECT_META_REQUEST](context: AugmentedExtensionContext, props: MetadataRequest): Promise<void>;

  [ActionTypes.SUBSCRIBE_WC_REQUESTS](context: AugmentedExtensionContext): Promise<SessionTypes.Struct[] | null>;
  [ActionTypes.APPROVE_WC_REQUEST](
    context: AugmentedExtensionContext,
    props: RequestApproveConnectWalletSession
  ): Promise<void>;
  [ActionTypes.REJECT_WC_REQUEST](
    context: AugmentedExtensionContext,
    props: RequestRejectConnectWalletSession
  ): Promise<void>;

  [ActionTypes.SUBSCRIBE_SIGN_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.SIGN_CANCEL](context: AugmentedExtensionContext, id: string): Promise<void>;
  [ActionTypes.APPROVE_SIGN_PASSWORD](context: AugmentedExtensionContext, payload: ApprovePayload): Promise<void>;
  [ActionTypes.SIGN_SIGNATURE](context: AugmentedExtensionContext, payload: SignPayload): Promise<void>;
  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS](context: AugmentedExtensionContext): Promise<void[]>;

  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS](context: AugmentedExtensionContext): Promise<void[]>;

  [ActionTypes.FETCH_TAB_STATUS](context: AugmentedExtensionContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_AUTH_REQUESTS]({ commit }) {
    const callback = (requests: AuthorizeRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'auth', requests });

      if (requests.length)
        router.push({
          name: Components.Authorize,
        });
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
      commit(MutationTypes.SET_REQUEST, { type: 'meta', requests });

      if (router.currentRoute.name === 'MetaRequest' && requests.length === 0)
        router.push({
          name: Components.Wallet,
        });

      if (requests.length)
        router.push({
          name: Components.MetaRequest,
        });
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
      commit(MutationTypes.SET_REQUEST, { type: 'sign', requests });
      if (router.currentRoute.name === 'Transaction' && requests.length === 0)
        router.push({
          name: Components.Wallet,
        });
      if (requests.length)
        router.push({
          name: Components.Transaction,
        });
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
    const wc = dispatch(ActionTypes.SUBSCRIBE_WC_REQUESTS);

    return Promise.all([auth, sign, meta, wc]);
  },

  async [ActionTypes.FETCH_TAB_STATUS]({ commit }) {
    const tabStatus = await isTabAuthorize();

    commit(MutationTypes.SET_TAB_STATUS, tabStatus);
  },

  async [ActionTypes.FETCH_FEATURES]({ commit }) {
    const { data } = await axios.get<Features>(URLS.FEATURES);

    commit(MutationTypes.SET_FEATURES, data);
  },

  async [ActionTypes.APPROVE_WC_REQUEST](_, payload) {
    await approveWalletConnectSession(payload);
    //do something with request
  },

  async [ActionTypes.REJECT_WC_REQUEST](_, payload) {
    await rejectWalletConnectSession(payload);
    //do something with request
  },

  async [ActionTypes.SUBSCRIBE_WC_REQUESTS]() {
    const callback = (requests: SessionTypes.Struct[] | null) => {
      console.info(requests, 'WC requests');
      if (requests === null) return;

      if (requests.length)
        router.push({
          name: Components.Transaction,
        });
    };

    return walletConnectSessionsSubscribe(callback);
  },
};

export default actions;
