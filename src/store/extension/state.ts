import {
  type ActiveTabAuthorizeStatus,
  type AuthorizeRequest,
  type AuthUrlInfo,
  type MetadataRequest,
  type SigningRequest,
} from '@extension-base/background/types/types';
import type { Features } from '@/store/extension/types';
import type {
  ConfirmationsEvmQueue,
  WalletConnectNotSupportRequest,
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';

export type State = {
  authRequests: AuthorizeRequest[];
  signRequests: SigningRequest[];
  metaRequests: MetadataRequest[];
  wcConnectRequests: WalletConnectSessionRequest[];
  wcNotSupportedRequests: WalletConnectNotSupportRequest[];
  wcRequests: WalletConnectTransactionRequest[];
  wcSessions: WalletConnectSessions;
  signEvmRequests: ConfirmationsEvmQueue;
  authList: Record<string, AuthUrlInfo>;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Nullable<Features>;
  onboarding: boolean;
};

const state = (): State => {
  return {
    authRequests: [],
    signRequests: [],
    metaRequests: [],
    wcConnectRequests: [],
    wcNotSupportedRequests: [],
    wcRequests: [],
    wcSessions: [],
    signEvmRequests: { sendTxRequest: {}, signMessageRequest: {} },
    authList: {},
    tabStatus: null,
    features: null,
    onboarding: false,
  };
};

export default state;
