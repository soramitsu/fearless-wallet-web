import axios from 'axios';
import type { HexString } from '@polkadot/util/types';
import type { EvmRequests } from '@extension-base/services/request-service/types';
import type { RequestsPayload } from './types';
import type { ExtensionStore } from '.';
import type {
  RequestApproveConnectWalletSession,
  RequestRejectConnectWalletSession,
  WalletConnectNotSupportRequest,
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type {
  ActiveTabAuthorizeStatus,
  ApproveAuthRequest,
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { Features } from '@/stores/extension/types';
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

export type ApprovePayload = {
  id: string;
};

type Actions = {
  subscribeAuthRequests(this: ExtensionStore): Promise<boolean>;
  approveAuthRequests(this: ExtensionStore, props: ApproveAuthRequest): Promise<void>;
  rejectAuthRequests(this: ExtensionStore, props: string): Promise<void>;
  deleteAuthRequests(this: ExtensionStore, props: string): Promise<void>;

  subscribeMetaRequests(this: ExtensionStore): Promise<boolean>;
  approveMetaRequests(this: ExtensionStore, props: MetadataRequest): Promise<void>;
  rejectMetaRequests(this: ExtensionStore, props: MetadataRequest): Promise<void>;

  subscribeWcRequests(this: ExtensionStore): Promise<WalletConnectTransactionRequest[]>;
  subscribeWcSessions(this: ExtensionStore): Promise<WalletConnectSessions>;
  subscribeWcConnectRequests(this: ExtensionStore): Promise<WalletConnectSessionRequest[]>;
  subscribeWcConnectSupportedRequests(this: ExtensionStore): Promise<WalletConnectNotSupportRequest[]>;
  approveWcRequests(this: ExtensionStore, props: RequestApproveConnectWalletSession): Promise<void>;
  rejectWcRequests(this: ExtensionStore, props: RequestRejectConnectWalletSession): Promise<void>;
  rejectWcNotSupportedRequests(this: ExtensionStore, props: RequestRejectConnectWalletSession): Promise<void>;

  subscribeSignRequests(this: ExtensionStore): Promise<boolean>;
  subscribeEvmSignRequests(this: ExtensionStore): Promise<boolean>;
  signCancel(this: ExtensionStore, id: string): Promise<void>;
  approveSign(this: ExtensionStore, payload: ApprovePayload): Promise<void>;
  subscribeExtensionRequests(this: ExtensionStore): Promise<void>;
  fetchTabStatus(this: ExtensionStore): Promise<void>;
  signSignature(this: ExtensionStore, params: { id: string; payload: { signature: HexString } }): Promise<void>;
  getAuthList(this: ExtensionStore): Promise<void>;
  fetchFeatures(this: ExtensionStore): Promise<void>;

  deleteRequest(
    this: ExtensionStore,
    payload: 'authRequests' | 'metaRequests' | 'signRequests' | 'wcConnectRequests' | 'wcNotSupportedRequests'
  ): void;
  setRequest(this: ExtensionStore, props: RequestsPayload): void;
  setTabStatus(this: ExtensionStore, props: ActiveTabAuthorizeStatus): void;
  setAuthList(this: ExtensionStore, props: ResponseAuthorizeList): void;
  setFeatures(this: ExtensionStore, props: Features): void;
};

export const actions: Actions = {
  setRequest({ type, requests }) {
    if (type === 'authRequests') this.authRequests = requests;

    if (type === 'metaRequests') this.metaRequests = requests;

    if (type === 'signRequests') this.signRequests = requests;

    if (type === 'signEvmRequests') this.signEvmRequests = requests;

    if (type === 'wcConnectRequests') this.wcConnectRequests = requests;

    if (type === 'wcNotSupportedRequests') this.wcNotSupportedRequests = requests;

    if (type === 'wcRequests') this.wcRequests = requests;

    if (type === 'wcSessions') this.wcSessions = requests;
  },

  deleteRequest(type) {
    this[type].shift();
  },

  setTabStatus(payload) {
    this.tabStatus = payload;
  },

  setAuthList({ list }) {
    this.authList = { ...list };
  },

  setFeatures(features) {
    this.features = features;
  },

  async subscribeAuthRequests() {
    const callback = (requests: AuthorizeRequest[]) => {
      this.setRequest({ type: 'authRequests', requests });

      if (requests.length)
        router.push({
          name: Components.Authorize,
        });
    };

    return subscribeAuthorizeRequests(callback);
  },

  async approveAuthRequests({ id, accounts }) {
    await approveAuthRequest(id, accounts);

    this.deleteRequest('authRequests');

    this.fetchTabStatus();
  },

  async rejectAuthRequests(payload) {
    await deleteAuthRequest(payload);

    this.deleteRequest('authRequests');

    this.fetchTabStatus();
  },

  async getAuthList() {
    const list = await getAuthList();

    this.setAuthList(list);
  },

  async deleteAuthRequests(id) {
    const response = await removeAuthorization(id);

    this.setAuthList(response);
  },

  async subscribeMetaRequests() {
    const callback = (requests: MetadataRequest[]) => {
      this.setRequest({ type: 'metaRequests', requests });

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

  async approveMetaRequests(payload) {
    await approveMetaRequest(payload.id);

    this.deleteRequest('metaRequests');

    this.fetchTabStatus();
  },

  async rejectMetaRequests(payload) {
    await rejectMetaRequest(payload.id);
    this.deleteRequest('metaRequests');
    this.fetchTabStatus();
  },

  async subscribeSignRequests() {
    const callback = (requests: SigningRequest[]) => {
      this.setRequest({ type: 'signRequests', requests });

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

  async subscribeEvmSignRequests() {
    const callback = (requests: EvmRequests) => {
      this.setRequest({ type: 'signEvmRequests', requests });

      const isRequestsExists = Object.keys(requests).length === 0;

      if (router.currentRoute.name === 'Transaction' && isRequestsExists) router.push({ name: Components.Wallet });
      else if (!isRequestsExists) router.push({ name: Components.Transaction });
    };

    return subscribeEvmSigningRequests(callback);
  },

  async approveSign({ id }) {
    await approveSign(id);

    this.deleteRequest('signRequests');

    router.push({ name: Components.Wallet });

    this.fetchTabStatus();
  },

  async signSignature({ payload, id }) {
    await approveSignSignature(id, payload.signature);

    this.deleteRequest('signRequests');

    this.fetchTabStatus();

    router.push({ name: Components.Wallet });
  },

  async signCancel(id) {
    await cancelSignRequest(id);

    this.deleteRequest('signRequests');

    router.push({ name: Components.Wallet });
  },

  async subscribeExtensionRequests() {
    const auth = this.subscribeAuthRequests();
    const sign = this.subscribeSignRequests();
    const signEvm = this.subscribeEvmSignRequests();
    const meta = this.subscribeMetaRequests();
    const wcConnectRequests = this.subscribeWcConnectRequests();
    const wcSessions = this.subscribeWcSessions();
    const wcRequests = this.subscribeWcRequests();

    await Promise.all([auth, sign, signEvm, meta, wcConnectRequests, wcSessions, wcRequests]);
  },

  async fetchTabStatus() {
    const tabStatus = await isTabAuthorize();

    this.setTabStatus(tabStatus);
  },

  async fetchFeatures() {
    const { data } = await axios.get<Features>(URLS.FEATURES);

    this.setFeatures(data);
  },

  async approveWcRequests(payload) {
    await approveWalletConnectSession(payload);
    this.deleteRequest('wcConnectRequests');

    this.fetchTabStatus();
  },

  async rejectWcRequests(payload) {
    await rejectWalletConnectSession(payload);

    this.deleteRequest('wcConnectRequests');
  },

  async subscribeWcConnectRequests() {
    const callback = (requests: WalletConnectSessionRequest[]) => {
      this.setRequest({ type: 'wcConnectRequests', requests });

      console.info(requests, 'WC requests');

      if (requests.length) router.push({ name: Components.WalletConnectAuthConfirmation });
    };

    return walletConnectRequestSubscribe(callback);
  },

  async subscribeWcConnectSupportedRequests() {
    const callback = (requests: WalletConnectNotSupportRequest[]) => {
      this.setRequest({ type: 'wcNotSupportedRequests', requests });

      console.info(requests, 'WC not supported requests');

      if (requests.length) router.push({ name: Components.WalletConnectNotSupportedRequest });
    };

    return subscribeWalletNotSupportedConnectRequest(callback);
  },

  async rejectWcNotSupportedRequests(payload) {
    await rejectWalletConnectSession(payload);

    this.deleteRequest('wcNotSupportedRequests');
  },

  async subscribeWcRequests() {
    const callback = (requests: WalletConnectTransactionRequest[]) => {
      this.setRequest({ type: 'wcRequests', requests });

      console.info(requests, 'WC requests');

      if (requests.length) router.push({ name: Components.WalletConnectSignConfirmation });
    };

    return subscribeWalletConnectRequest(callback);
  },

  async subscribeWcSessions() {
    const callback = (requests: WalletConnectSessions) => {
      this.setRequest({ type: 'wcSessions', requests });

      console.info(requests, 'WC sessions');
    };

    return walletConnectSessionsSubscribe(callback);
  },
};
