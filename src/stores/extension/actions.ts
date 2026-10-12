import axios from 'axios';
import { resolveActionCapabilities, type MutableAction } from '@extension-base/services/action-capability-service';
import type { HexString } from '@polkadot/util/types';
import type { EvmRequests, SolanaRequests } from '@extension-base/services/request-service/types';
import type { RequestsPayload } from './types';
import type { ExtensionStore } from '.';
import type {
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
  // RequestApproveConnectWalletSession,
  // RequestRejectConnectWalletSession,
  // WalletConnectNotSupportRequest,
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
  walletConnectSessionsSubscribe,
  walletConnectRequestSubscribe,
  subscribeWalletConnectRequest,
  subscribeEvmSigningRequests,
  subscribeSolanaSigningRequests,
  approveSign,
  approveSignSignature,
  // approveWalletConnectSession,
  // rejectWalletConnectSession,
  // subscribeWalletNotSupportedConnectRequest,
} from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';
import { URLS } from '@/consts/urls';
import { LocalStorage } from '@/controllers/localStorageController';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';

const featureStorage = new LocalStorage('feature_');
// Holds the remote config itself (fiat, remembered explicit capability values,
// discovery mode) so the background's veto-only policy can be re-applied. The
// unversioned `action-capabilities` key stored defaulted `false` values that
// cannot be told apart from vetoes, so it is ignored and left untouched.
const FEATURES_CACHE_KEY = 'action-capabilities-v2';

type CachedFeatures = {
  fiat?: Record<string, unknown>;
  actions?: Partial<Record<MutableAction, boolean>>;
  assetDiscoveryMode?: Features['assetDiscoveryMode'];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const readCachedFeatures = (): CachedFeatures | undefined => {
  try {
    return featureStorage.get<CachedFeatures>(FEATURES_CACHE_KEY).value;
  } catch {
    return undefined;
  }
};

const toFeatures = (remote: CachedFeatures | undefined): Features => {
  const capabilities = resolveActionCapabilities(remote ?? {});

  return {
    fiat: { moonpay: false, ramp: false, ...record(remote?.fiat) },
    actions: capabilities.actions,
    assetDiscoveryMode: capabilities.assetDiscoveryMode,
  };
};

export type ApprovePayload = {
  id: string;
};

type SigningQueue = 'signRequests' | 'signEvmRequests' | 'signSolanaRequests';

const signingQueueFor = (store: ExtensionStore, id: string): SigningQueue | undefined => {
  if (store.signRequests.some((request) => request.id === id)) return 'signRequests';
  if (Object.values(store.signEvmRequests).some((request) => request.id === id)) return 'signEvmRequests';
  if (Object.values(store.signSolanaRequests).some((request) => request.id === id)) return 'signSolanaRequests';
};

const removeSigningRequest = (store: ExtensionStore, queue: SigningQueue | undefined, id: string) => {
  if (queue === 'signRequests') store.deleteRequest(queue, id);
  else if (queue) {
    for (const [key, request] of Object.entries(store[queue])) {
      if (request.id === id) delete store[queue][key];
    }
  }
};

// Each ecosystem publishes independently. An empty update from one must not hide another's prompt.
const routeSigningRequests = (store: ExtensionStore, incomingRequests = false) => {
  const pending =
    store.signRequests.length +
    Object.keys(store.signEvmRequests).length +
    Object.keys(store.signSolanaRequests).length;
  const onSigningScreen = router.currentRoute.value.name === Components.Transaction;

  if (!pending && onSigningScreen) void router.push({ name: Components.Wallet });
  else if (incomingRequests && !onSigningScreen) void router.push({ name: Components.Transaction });
};

type Actions = {
  subscribeAuthRequests(this: ExtensionStore): Promise<AuthorizeRequest[]>;
  approveAuthRequests(this: ExtensionStore, props: ApproveAuthRequest): Promise<void>;
  rejectAuthRequests(this: ExtensionStore, props: string): Promise<void>;
  deleteAuthRequests(this: ExtensionStore, props: string): Promise<void>;

  subscribeMetaRequests(this: ExtensionStore): Promise<MetadataRequest[]>;
  approveMetaRequests(this: ExtensionStore, props: MetadataRequest): Promise<void>;
  rejectMetaRequests(this: ExtensionStore, props: MetadataRequest): Promise<void>;

  subscribeWcRequests(this: ExtensionStore): Promise<WalletConnectTransactionRequest[]>;
  subscribeWcSessions(this: ExtensionStore): Promise<WalletConnectSessions>;
  subscribeWcConnectRequests(this: ExtensionStore): Promise<WalletConnectSessionRequest[]>;
  // subscribeWcConnectSupportedRequests(this: ExtensionStore): Promise<WalletConnectNotSupportRequest[]>;
  // rejectWcNotSupportedRequests(this: ExtensionStore, props: RequestRejectConnectWalletSession): Promise<void>;
  // approveWcRequests(this: ExtensionStore, props: RequestApproveConnectWalletSession): Promise<void>;
  // rejectWcRequests(this: ExtensionStore, props: RequestRejectConnectWalletSession): Promise<void>;

  subscribeSignRequests(this: ExtensionStore): Promise<SigningRequest[]>;
  subscribeEvmSignRequests(this: ExtensionStore): Promise<EvmRequests>;
  subscribeSolanaSignRequests(this: ExtensionStore): Promise<SolanaRequests>;
  signCancel(this: ExtensionStore, id: string): Promise<void>;
  approveSign(this: ExtensionStore, payload: ApprovePayload): Promise<boolean>;
  subscribeExtensionRequests(this: ExtensionStore): Promise<boolean>;
  fetchTabStatus(this: ExtensionStore): Promise<void>;
  signSignature(this: ExtensionStore, params: { id: string; payload: { signature: HexString } }): Promise<void>;
  getAuthList(this: ExtensionStore): Promise<void>;
  fetchFeatures(this: ExtensionStore): Promise<void>;

  deleteRequest(
    this: ExtensionStore,
    payload: 'authRequests' | 'metaRequests' | 'signRequests' | 'wcConnectRequests' | 'wcNotSupportedRequests',
    id: string
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

    if (type === 'signSolanaRequests') this.signSolanaRequests = requests;

    if (type === 'wcConnectRequests') this.wcConnectRequests = requests;

    // if (type === 'wcNotSupportedRequests') this.wcNotSupportedRequests = requests;

    if (type === 'wcRequests') this.wcRequests = requests;

    if (type === 'wcSessions') this.wcSessions = requests;
  },

  deleteRequest(type, id) {
    const index = this[type].findIndex((request) => request.id === id);
    if (index >= 0) this[type].splice(index, 1);
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

    this.deleteRequest('authRequests', id);

    this.fetchTabStatus();
  },

  async rejectAuthRequests(payload) {
    await deleteAuthRequest(payload);

    this.deleteRequest('authRequests', payload);

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

      if (router.currentRoute.value.name === 'MetaRequest' && requests.length === 0)
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
    const { id } = payload;
    await approveMetaRequest(id);

    this.deleteRequest('metaRequests', id);

    this.fetchTabStatus();
  },

  async rejectMetaRequests(payload) {
    const { id } = payload;
    await rejectMetaRequest(id);

    this.deleteRequest('metaRequests', id);
    this.fetchTabStatus();
  },

  async subscribeSignRequests() {
    const callback = (requests: SigningRequest[]) => {
      this.setRequest({ type: 'signRequests', requests });

      routeSigningRequests(this, requests.length > 0);
    };

    return subscribeSigningRequests(callback);
  },

  async subscribeEvmSignRequests() {
    const callback = (requests: EvmRequests) => {
      this.setRequest({ type: 'signEvmRequests', requests });

      routeSigningRequests(this, Object.keys(requests).length > 0);
    };

    return subscribeEvmSigningRequests(callback);
  },

  async subscribeSolanaSignRequests() {
    const callback = (requests: SolanaRequests) => {
      this.setRequest({ type: 'signSolanaRequests', requests });

      routeSigningRequests(this, Object.keys(requests).length > 0);
    };

    return subscribeSolanaSigningRequests(callback);
  },

  async approveSign({ id }) {
    const queue = signingQueueFor(this, id);
    const signed = await approveSign(id);

    removeSigningRequest(this, queue, id);
    routeSigningRequests(this);

    this.fetchTabStatus();
    return signed;
  },

  async signSignature({ payload, id }) {
    const queue = signingQueueFor(this, id);
    await approveSignSignature(id, payload.signature);

    removeSigningRequest(this, queue, id);

    this.fetchTabStatus();

    routeSigningRequests(this);
  },

  async signCancel(id) {
    const queue = signingQueueFor(this, id);
    await cancelSignRequest(id);

    removeSigningRequest(this, queue, id);
    routeSigningRequests(this);
  },

  async subscribeExtensionRequests() {
    const signEvm = this.subscribeEvmSignRequests();
    const signSolana = this.subscribeSolanaSignRequests();
    const auth = this.subscribeAuthRequests();
    const sign = this.subscribeSignRequests();
    const meta = this.subscribeMetaRequests();
    const wcConnectRequests = this.subscribeWcConnectRequests();
    const wcSessions = this.subscribeWcSessions();
    const wcRequests = this.subscribeWcRequests();

    const promises = await Promise.all([wcSessions, signEvm, signSolana, auth, sign, meta, wcConnectRequests, wcRequests]);

    return !!Object.keys(promises[1]).length || !!Object.keys(promises[2]).length || !!promises.slice(3).flat().length;
  },

  async fetchTabStatus() {
    const tabStatus = await isTabAuthorize();

    this.setTabStatus(tabStatus);
  },

  async fetchFeatures() {
    const cached = readCachedFeatures();
    this.setFeatures(toFeatures(cached));
    // The Bitcoin and Solana send kill switch is veto-only and sticky.
    const sendKillSwitch = useSendKillSwitchStore();

    sendKillSwitch.restoreRemembered();

    try {
      const { data } = await axios.get<unknown>(URLS.FEATURES);

      sendKillSwitch.applyRemoteConfig(data);

      const capabilities = resolveActionCapabilities(data, Date.now(), cached?.actions);
      const remote: CachedFeatures = {
        fiat: record(record(data).fiat),
        actions: capabilities.remoteActions,
        assetDiscoveryMode: capabilities.assetDiscoveryMode,
      };

      this.setFeatures(toFeatures(remote));
      featureStorage.set(FEATURES_CACHE_KEY, remote);
    } catch {
      // Keep the cached remote config: a remembered veto stays in force offline,
      // and without one the release defaults apply.
    }
  },

  async subscribeWcConnectRequests() {
    const callback = (requests: WalletConnectSessionRequest[]) => {
      this.setRequest({ type: 'wcConnectRequests', requests });

      console.info(requests, 'WC requests');

      if (requests.length) router.push({ name: Components.WalletConnectAuthConfirmation });
    };

    return walletConnectRequestSubscribe(callback);
  },

  // async approveWcRequests(payload) {
  //   await approveWalletConnectSession(payload);
  //   this.deleteRequest('wcConnectRequests');

  //   this.fetchTabStatus();
  // },

  // async rejectWcRequests(payload) {
  //   await rejectWalletConnectSession(payload);

  //   this.deleteRequest('wcConnectRequests');
  // },

  // async subscribeWcConnectSupportedRequests() {
  //   const callback = (requests: WalletConnectNotSupportRequest[]) => {
  //     this.setRequest({ type: 'wcNotSupportedRequests', requests });

  //     console.info(requests, 'WC not supported requests');

  //     if (requests.length) router.push({ name: Components.WalletConnectNotSupportedRequest });
  //   };

  //   return subscribeWalletNotSupportedConnectRequest(callback);
  // },

  // async rejectWcNotSupportedRequests(payload) {
  //   await rejectWalletConnectSession(payload);

  //   this.deleteRequest('wcNotSupportedRequests');
  // },

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
