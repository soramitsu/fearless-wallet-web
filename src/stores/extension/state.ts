import type { EvmRequests, SolanaRequests } from '@extension-base/services/request-service/types';
import type {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrls,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { Features } from '@/stores/extension/types';
import type {
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
  signEvmRequests: EvmRequests;
  signSolanaRequests: SolanaRequests;
  authList: AuthUrls;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Nullable<Features>;
  onboarding: boolean;
};

export const state = (): State => {
  return {
    authRequests: [],
    signRequests: [],
    metaRequests: [],
    wcConnectRequests: [],
    wcNotSupportedRequests: [],
    wcRequests: [],
    wcSessions: [],
    signEvmRequests: {},
    signSolanaRequests: {},
    authList: {},
    tabStatus: null,
    features: null,
    onboarding: false,
  };
};
