import { SessionTypes } from '@walletconnect/types';
import {
  AuthorizeRequest,
  MetadataRequest,
  SigningRequest,
} from '@/extension/background/extension-base/src/background/types/types';
import {
  WalletConnectSessionRequest,
  WalletConnectNotSupportRequest,
  WalletConnectTransactionRequest,
} from '@/extension/background/extension-base/src/services/wallet-connect-service/types';

export interface Features {
  fiat: {
    soraCard: boolean;
    moonpay: boolean;
    ramp: boolean;
  };
}

export type SetRequestsPayload =
  | {
      type: 'authRequests';
      requests: AuthorizeRequest[];
    }
  | {
      type: 'metaRequests';
      requests: MetadataRequest[];
    }
  | {
      type: 'signRequests';
      requests: SigningRequest[];
    }
  | {
      type: 'wcConnectRequests';
      requests: WalletConnectSessionRequest[];
    }
  | {
      type: 'wcNotSupportedRequests';
      requests: WalletConnectNotSupportRequest[];
    }
  | {
      type: 'wcRequests';
      requests: WalletConnectTransactionRequest[];
    }
  | {
      type: 'wcSessions';
      requests: SessionTypes.Struct[];
    };
