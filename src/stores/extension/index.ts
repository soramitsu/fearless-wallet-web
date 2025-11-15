import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import axios from 'axios';
import type { HexString } from '@polkadot/util/types';
import type {
  ActiveTabAuthorizeStatus,
  ApproveAuthRequest,
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
  SigningRequest,
  AuthUrls,
  AuthUrlInfo,
} from '@extension-base/background/types/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { EvmRequestPayload, EvmRequests } from '@extension-base/services/request-service/types';
import type {
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
  WalletConnectNotSupportRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type { Features, RequestsPayload, SignRequests } from '@/stores/extension/types';
import router from '@/router';
import { Components } from '@/router/routes';
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
  approveSign,
  approveSignSignature,
} from '@/extension/messaging';
import { URLS } from '@/consts/urls';

export const useExtensionStore = defineStore('extension', () => {
  const authRequests = ref<AuthorizeRequest[]>([]);
  const signRequests = ref<SigningRequest[]>([]);
  const metaRequests = ref<MetadataRequest[]>([]);
  const wcConnectRequests = ref<WalletConnectSessionRequest[]>([]);
  const wcNotSupportedRequests = ref<WalletConnectNotSupportRequest[]>([]);
  const wcRequests = ref<WalletConnectTransactionRequest[]>([]);
  const wcSessions = ref<WalletConnectSessions>([]);
  const signEvmRequests = ref<EvmRequests>({});
  const authList = ref<AuthUrls>({});
  const tabStatus = ref<ActiveTabAuthorizeStatus | null>(null);
  const features = ref<Features | null>(null);
  const onboarding = ref<boolean>(false);

  const getAuthItem = computed(() => {
    return (value: string): AuthUrlInfo | undefined => authList.value[value];
  });

  const signRequestPayload = computed<SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload>(() => {
    if (signRequests.value.length) return signRequests.value[0].request.payload;

    const [evmRequest] = Object.values(signEvmRequests.value);

    return evmRequest!;
  });

  const signAllRequests = computed<SignRequests>(() => ({
    substrate: signRequests.value,
    evm: signEvmRequests.value,
  }));

  const setRequest = ({ type, requests }: RequestsPayload) => {
    switch (type) {
      case 'authRequests':
        authRequests.value = requests;
        break;
      case 'metaRequests':
        metaRequests.value = requests;
        break;
      case 'signRequests':
        signRequests.value = requests;
        break;
      case 'signEvmRequests':
        signEvmRequests.value = requests;
        break;
      case 'wcConnectRequests':
        wcConnectRequests.value = requests;
        break;
      case 'wcNotSupportedRequests':
        wcNotSupportedRequests.value = requests;
        break;
      case 'wcRequests':
        wcRequests.value = requests;
        break;
      case 'wcSessions':
        wcSessions.value = requests;
        break;
    }
  };

  const deleteRequest = (
    type: 'authRequests' | 'metaRequests' | 'signRequests' | 'wcConnectRequests' | 'wcNotSupportedRequests'
  ) => {
    if (type === 'authRequests') {
      authRequests.value = authRequests.value.slice(1);
    } else if (type === 'metaRequests') {
      metaRequests.value = metaRequests.value.slice(1);
    } else if (type === 'signRequests') {
      signRequests.value = signRequests.value.slice(1);
    } else if (type === 'wcConnectRequests') {
      wcConnectRequests.value = wcConnectRequests.value.slice(1);
    } else if (type === 'wcNotSupportedRequests') {
      wcNotSupportedRequests.value = wcNotSupportedRequests.value.slice(1);
    }
  };

  const setTabStatus = (status: ActiveTabAuthorizeStatus) => {
    tabStatus.value = status;
  };

  const setAuthList = ({ list }: ResponseAuthorizeList) => {
    authList.value = { ...list };
  };

  const setFeatures = (value: Features) => {
    features.value = value;
  };

  const subscribeAuthRequestsAction = async () => {
    const callback = (requests: AuthorizeRequest[]) => {
      setRequest({ type: 'authRequests', requests });
    };

    return subscribeAuthorizeRequests(callback);
  };

  const approveAuthRequests = async ({ id, accounts }: ApproveAuthRequest) => {
    await approveAuthRequest(id, accounts);
    deleteRequest('authRequests');
    void fetchTabStatus();
  };

  const rejectAuthRequests = async (id: string) => {
    await deleteAuthRequest(id);
    deleteRequest('authRequests');
    void fetchTabStatus();
  };

  const subscribeMetaRequestsAction = async () => {
    const callback = (requests: MetadataRequest[]) => {
      setRequest({ type: 'metaRequests', requests });

      if (router.currentRoute.value.name === 'MetaRequest' && requests.length === 0) {
        router.push({ name: Components.Wallet }).catch(() => {});
      }

      if (requests.length) {
        router.push({ name: Components.MetaRequest }).catch(() => {});
      }
    };

    return subscribeMetadataRequests(callback);
  };

  const approveMetaRequests = async (payload: MetadataRequest) => {
    await approveMetaRequest(payload.id);
    deleteRequest('metaRequests');
    void fetchTabStatus();
  };

  const rejectMetaRequests = async (payload: MetadataRequest) => {
    await rejectMetaRequest(payload.id);
    deleteRequest('metaRequests');
    void fetchTabStatus();
  };

  const subscribeSignRequestsAction = async () => {
    const callback = (requests: SigningRequest[]) => {
      setRequest({ type: 'signRequests', requests });

      if (router.currentRoute.value.name === 'Transaction' && requests.length === 0) {
        router.push({ name: Components.Wallet }).catch(() => {});
      }

      if (requests.length) {
        router.push({ name: Components.Transaction }).catch(() => {});
      }
    };

    return subscribeSigningRequests(callback);
  };

  const subscribeEvmSignRequestsAction = async () => {
    const callback = (requests: EvmRequests) => {
      setRequest({ type: 'signEvmRequests', requests });

      const hasRequests = Object.keys(requests).length !== 0;

      if (router.currentRoute.value.name === 'Transaction' && !hasRequests) {
        router.push({ name: Components.Wallet }).catch(() => {});
      } else if (hasRequests) {
        router.push({ name: Components.Transaction }).catch(() => {});
      }
    };

    return subscribeEvmSigningRequests(callback);
  };

  const approveSignAction = async ({ id }: { id: string }) => {
    await approveSign(id);
    deleteRequest('signRequests');
    router.push({ name: Components.Wallet }).catch(() => {});
    void fetchTabStatus();
  };

  const signSignature = async ({ id, payload }: { id: string; payload: { signature: HexString } }) => {
    await approveSignSignature(id, payload.signature);
    deleteRequest('signRequests');
    void fetchTabStatus();
    router.push({ name: Components.Wallet }).catch(() => {});
  };

  const signCancel = async (id: string) => {
    await cancelSignRequest(id);
    deleteRequest('signRequests');
    router.push({ name: Components.Wallet }).catch(() => {});
  };

  const subscribeWcConnectRequests = async () => {
    const callback = (requests: WalletConnectSessionRequest[]) => {
      setRequest({ type: 'wcConnectRequests', requests });

      console.info(requests, 'WC requests');

      if (requests.length) {
        router.push({ name: Components.WalletConnectAuthConfirmation }).catch(() => {});
      }
    };

    return walletConnectRequestSubscribe(callback);
  };

  const subscribeWcRequests = async () => {
    const callback = (requests: WalletConnectTransactionRequest[]) => {
      setRequest({ type: 'wcRequests', requests });

      console.info(requests, 'WC requests');

      if (requests.length) {
        router.push({ name: Components.WalletConnectSignConfirmation }).catch(() => {});
      }
    };

    return subscribeWalletConnectRequest(callback);
  };

  const subscribeWcSessions = async () => {
    const callback = (requests: WalletConnectSessions) => {
      setRequest({ type: 'wcSessions', requests });

      console.info(requests, 'WC sessions');
    };

    return walletConnectSessionsSubscribe(callback);
  };

  const subscribeExtensionRequests = async () => {
    const signEvm = subscribeEvmSignRequestsAction();
    const auth = subscribeAuthRequestsAction();
    const sign = subscribeSignRequestsAction();
    const meta = subscribeMetaRequestsAction();
    const wcConnect = subscribeWcConnectRequests();
    const wcSessionsPromise = subscribeWcSessions();
    const wcRequestsPromise = subscribeWcRequests();

    const promises = await Promise.all([wcSessionsPromise, signEvm, auth, sign, meta, wcConnect, wcRequestsPromise]);

    const [, evmRequests, ...rest] = promises;

    return !!Object.keys(evmRequests as EvmRequests).length || !!(rest.flat() as unknown[]).length;
  };

  const fetchTabStatus = async () => {
    const status = await isTabAuthorize();
    setTabStatus(status);
  };

  const getAuthListAction = async () => {
    const list = await getAuthList();
    setAuthList(list);
  };

  const deleteAuthRequests = async (id: string) => {
    const response = await removeAuthorization(id);
    setAuthList(response);
  };

  const fetchFeatures = async () => {
    const { data } = await axios.get<Features>(URLS.FEATURES);
    setFeatures(data);
  };

  return {
    // state
    authRequests,
    signRequests,
    metaRequests,
    wcConnectRequests,
    wcNotSupportedRequests,
    wcRequests,
    wcSessions,
    signEvmRequests,
    authList,
    tabStatus,
    features,
    onboarding,
    // getters
    getAuthItem,
    signRequestPayload,
    signAllRequests,
    // actions
    setRequest,
    deleteRequest,
    setTabStatus,
    setAuthList,
    setFeatures,
    subscribeAuthRequests: subscribeAuthRequestsAction,
    approveAuthRequests,
    rejectAuthRequests,
    deleteAuthRequests,
    subscribeMetaRequests: subscribeMetaRequestsAction,
    approveMetaRequests,
    rejectMetaRequests,
    subscribeSignRequests: subscribeSignRequestsAction,
    subscribeEvmSignRequests: subscribeEvmSignRequestsAction,
    signCancel,
    approveSign: approveSignAction,
    subscribeExtensionRequests,
    fetchTabStatus,
    signSignature,
    getAuthList: getAuthListAction,
    fetchFeatures,
    subscribeWcRequests,
    subscribeWcSessions,
    subscribeWcConnectRequests,
  };
});

export type ExtensionStore = ReturnType<typeof useExtensionStore>;
