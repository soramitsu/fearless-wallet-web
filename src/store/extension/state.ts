import type {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { Features, ScamAddressList } from '@/store/extension/types';
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
  authList: Record<string, AuthUrlInfo>;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Nullable<Features>;
  onboarding: boolean;
  scamAddresses: ScamAddressList;
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
    authList: {},
    tabStatus: null,
    features: null,
    onboarding: false,
    scamAddresses: [],
  };
};

export default state;
