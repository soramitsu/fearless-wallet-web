import axios from 'axios';
import { type EvmRequests } from '@extension-base/services/request-service/types';
import type {
  RequestApproveConnectWalletSession,
  RequestRejectConnectWalletSession,
  WalletConnectNotSupportRequest,
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type {
  ApproveAuthRequest,
  AuthorizeRequest,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from '@/store/extension/state';
import type { Features } from '@/store/extension/types';
import { type Mutations, MutationTypes } from '@/store/extension/mutations';
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
  walletConnectRequestSubscribe,
  subscribeWalletConnectRequest,
  subscribeEvmSigningRequests,
  subscribeWalletNotSupportedConnectRequest,
  approveSign,
  approveSignSignature,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';
import { URLS } from '@/consts/urls';

export enum ActionTypes {
  SUBSCRIBE_AUTH_REQUESTS = 'SUBSCRIBE_AUTH_REQUESTS',
  APPROVE_AUTH_REQUEST = 'APPROVE_AUTH_REQUEST',
  REJECT_AUTH_REQUEST = 'REJECT_AUTH_REQUEST',
  GET_AUTHLIST = 'GET_AUTHLIST',
  DELETE_AUTH_CONNECTION = 'DELETE_AUTH_CONNECTION',

  SUBSCRIBE_SIGN_REQUESTS = 'SUBSCRIBE_SIGN_REQUESTS',
  SIGN_CANCEL = 'SIGN_CANCEL',
  APPROVE_SIGN = 'APPROVE_SIGN',
  SIGN_SIGNATURE = 'SIGN_SIGNATURE',

  SUBSCRIBE_META_REQUESTS = 'SUBSCRIBE_META_REQUESTS',
  APPROVE_META_REQUEST = 'APPROVE_META_REQUEST',
  REJECT_META_REQUEST = 'REJECT_META_REQUEST',

  SUBSCRIBE_EVM_SIGN_REQUESTS = 'SUBSCRIBE_EVM_SIGN_REQUESTS',

  SUBSCRIBE_WC_CONNECT_REQUESTS = 'SUBSCRIBE_WC_CONNECT_REQUESTS',
  SUBSCRIBE_WC_CONNECT_NO_SUPPORTED_REQUESTS = 'SUBSCRIBE_WC_CONNECT_NO_SUPPORTED_REQUESTS',
  SUBSCRIBE_WC_REQUESTS = 'SUBSCRIBE_WC_REQUESTS',
  SUBSCRIBE_WC_SESSIONS = 'SUBSCRIBE_WC_SESSIONS',
  APPROVE_WC_REQUEST = 'APPROVE_WC_REQUEST',
  REJECT_WC_REQUEST = 'REJECT_WC_REQUEST',
  REJECT_WC_NOT_SUPPORTED_REQUEST = 'REJECT_WC_NOT_SUPPORTED_REQUEST',

  SUBSCRIBE_EXTENSION_REQUESTS = 'SUBSCRIBE_EXTENSION_REQUESTS',
  FETCH_TAB_STATUS = 'FETCH_TAB_STATUS',
  FETCH_FEATURES = 'FETCH_FEATURES',
}

export type ApprovePayload = {
  id: string;
};

type AugmentedExtensionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.SUBSCRIBE_AUTH_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.APPROVE_AUTH_REQUEST](context: AugmentedExtensionContext, props: ApproveAuthRequest): Promise<void>;
  [ActionTypes.REJECT_AUTH_REQUEST](context: AugmentedExtensionContext, props: string): Promise<void>;
  [ActionTypes.DELETE_AUTH_CONNECTION](context: AugmentedExtensionContext, props: string): Promise<void>;

  [ActionTypes.SUBSCRIBE_META_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.APPROVE_META_REQUEST](context: AugmentedExtensionContext, props: MetadataRequest): Promise<void>;
  [ActionTypes.REJECT_META_REQUEST](context: AugmentedExtensionContext, props: MetadataRequest): Promise<void>;

  [ActionTypes.SUBSCRIBE_WC_REQUESTS](context: AugmentedExtensionContext): Promise<WalletConnectTransactionRequest[]>;
  [ActionTypes.SUBSCRIBE_WC_SESSIONS](context: AugmentedExtensionContext): Promise<WalletConnectSessions>;
  [ActionTypes.SUBSCRIBE_WC_CONNECT_REQUESTS](
    context: AugmentedExtensionContext
  ): Promise<WalletConnectSessionRequest[]>;
  [ActionTypes.APPROVE_WC_REQUEST](
    context: AugmentedExtensionContext,
    props: RequestApproveConnectWalletSession
  ): Promise<void>;
  [ActionTypes.REJECT_WC_REQUEST](
    context: AugmentedExtensionContext,
    props: RequestRejectConnectWalletSession
  ): Promise<void>;

  [ActionTypes.SUBSCRIBE_SIGN_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.SUBSCRIBE_EVM_SIGN_REQUESTS](context: AugmentedExtensionContext): Promise<boolean>;
  [ActionTypes.SIGN_CANCEL](context: AugmentedExtensionContext, id: string): Promise<void>;
  [ActionTypes.APPROVE_SIGN](context: AugmentedExtensionContext, payload: ApprovePayload): Promise<void>;
  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS](context: AugmentedExtensionContext): Promise<void[]>;
  [ActionTypes.FETCH_TAB_STATUS](context: AugmentedExtensionContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_AUTH_REQUESTS]({ commit }) {
    const callback = (requests: AuthorizeRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'authRequests', requests });

      if (requests.length)
        router.push({
          name: Components.Authorize,
        });
    };

    return subscribeAuthorizeRequests(callback);
  },

  async [ActionTypes.APPROVE_AUTH_REQUEST]({ commit, dispatch }, { id, accounts }) {
    await approveAuthRequest(id, accounts);

    commit(MutationTypes.DELETE_REQUEST, 'authRequests');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.REJECT_AUTH_REQUEST]({ commit, dispatch }, payload) {
    await deleteAuthRequest(payload);

    commit(MutationTypes.DELETE_REQUEST, 'authRequests');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.GET_AUTHLIST]({ commit }) {
    const list = await getAuthList();

    commit(MutationTypes.SET_AUTHLIST, list);
  },

  async [ActionTypes.DELETE_AUTH_CONNECTION]({ commit }, id) {
    const response = await removeAuthorization(id);

    commit(MutationTypes.SET_AUTHLIST, response);
  },

  async [ActionTypes.SUBSCRIBE_META_REQUESTS]({ commit }) {
    const callback = (requests: MetadataRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'metaRequests', requests });

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

    commit(MutationTypes.DELETE_REQUEST, 'metaRequests');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.REJECT_META_REQUEST]({ commit, dispatch }, payload) {
    await rejectMetaRequest(payload.id);
    commit(MutationTypes.DELETE_REQUEST, 'metaRequests');
    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.SUBSCRIBE_SIGN_REQUESTS]({ commit }) {
    const callback = (requests: SigningRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'signRequests', requests });
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

  async [ActionTypes.SUBSCRIBE_EVM_SIGN_REQUESTS]({ commit }) {
    const callback = (requests: EvmRequests) => {
      commit(MutationTypes.SET_REQUEST, { type: 'signEvmRequests', requests });

      const isRequestsExists = Object.keys(requests).length === 0;

      if (router.currentRoute.name === 'Transaction' && isRequestsExists) router.push({ name: Components.Wallet });
      else if (!isRequestsExists) router.push({ name: Components.Transaction });
    };

    return subscribeEvmSigningRequests(callback);
  },

  async [ActionTypes.APPROVE_SIGN]({ commit, dispatch }, { id }) {
    approveSign(id).then(() => {
      commit(MutationTypes.DELETE_REQUEST, 'signRequests');

      router.push({ name: Components.Wallet });

      dispatch(ActionTypes.FETCH_TAB_STATUS);
    });
  },

  async [ActionTypes.SIGN_SIGNATURE]({ commit, dispatch }, { payload, id }) {
    approveSignSignature(id, payload.signature);

    commit(MutationTypes.DELETE_REQUEST, 'signRequests');

    dispatch(ActionTypes.FETCH_TAB_STATUS);

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_CANCEL]({ commit }, id) {
    await cancelSignRequest(id);

    commit(MutationTypes.DELETE_REQUEST, 'signRequests');

    router.push({ name: Components.Wallet });
  },

  [ActionTypes.SUBSCRIBE_EXTENSION_REQUESTS]({ dispatch }) {
    const auth = dispatch(ActionTypes.SUBSCRIBE_AUTH_REQUESTS);
    const sign = dispatch(ActionTypes.SUBSCRIBE_SIGN_REQUESTS);
    const signEvm = dispatch(ActionTypes.SUBSCRIBE_EVM_SIGN_REQUESTS);
    const meta = dispatch(ActionTypes.SUBSCRIBE_META_REQUESTS);
    const wcConnectRequests = dispatch(ActionTypes.SUBSCRIBE_WC_CONNECT_REQUESTS);
    const wcSessions = dispatch(ActionTypes.SUBSCRIBE_WC_SESSIONS);
    const wcRequests = dispatch(ActionTypes.SUBSCRIBE_WC_REQUESTS);

    return Promise.all([auth, sign, signEvm, meta, wcConnectRequests, wcSessions, wcRequests]);
  },

  async [ActionTypes.FETCH_TAB_STATUS]({ commit }) {
    const tabStatus = await isTabAuthorize();

    commit(MutationTypes.SET_TAB_STATUS, tabStatus);
  },

  async [ActionTypes.FETCH_FEATURES]({ commit }) {
    const { data } = await axios.get<Features>(URLS.FEATURES);

    commit(MutationTypes.SET_FEATURES, data);
  },

  async [ActionTypes.APPROVE_WC_REQUEST]({ commit, dispatch }, payload) {
    await approveWalletConnectSession(payload);
    commit(MutationTypes.DELETE_REQUEST, 'wcConnectRequests');

    dispatch(ActionTypes.FETCH_TAB_STATUS);
  },

  async [ActionTypes.REJECT_WC_REQUEST]({ commit }, payload) {
    await rejectWalletConnectSession(payload);

    commit(MutationTypes.DELETE_REQUEST, 'wcConnectRequests');
  },

  async [ActionTypes.SUBSCRIBE_WC_CONNECT_REQUESTS]({ commit }) {
    const callback = (requests: WalletConnectSessionRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'wcConnectRequests', requests });
      console.info(requests, 'WC requests');

      if (requests.length) router.push({ name: Components.WalletConnectAuthConfirmation });
    };

    return walletConnectRequestSubscribe(callback);
  },

  async [ActionTypes.SUBSCRIBE_WC_CONNECT_NO_SUPPORTED_REQUESTS]({ commit }) {
    const callback = (requests: WalletConnectNotSupportRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'wcNotSupportedRequests', requests });
      console.info(requests, 'WC not supported requests');

      if (requests.length) router.push({ name: Components.WalletConnectNotSupportedRequest });
    };

    return subscribeWalletNotSupportedConnectRequest(callback);
  },

  async [ActionTypes.REJECT_WC_NOT_SUPPORTED_REQUEST]({ commit }, payload) {
    await rejectWalletConnectSession(payload);

    commit(MutationTypes.DELETE_REQUEST, 'wcNotSupportedRequests');
  },

  async [ActionTypes.SUBSCRIBE_WC_REQUESTS]({ commit }) {
    const callback = (requests: WalletConnectTransactionRequest[]) => {
      commit(MutationTypes.SET_REQUEST, { type: 'wcRequests', requests });
      console.info(requests, 'WC requests');

      if (requests.length) router.push({ name: Components.WalletConnectSignConfirmation });
    };

    return subscribeWalletConnectRequest(callback);
  },

  async [ActionTypes.SUBSCRIBE_WC_SESSIONS]({ commit }) {
    const callback = (requests: WalletConnectSessions) => {
      commit(MutationTypes.SET_REQUEST, { type: 'wcSessions', requests });

      console.info(requests, 'WC sessions');
    };

    return walletConnectSessionsSubscribe(callback);
  },
};

export default actions;
