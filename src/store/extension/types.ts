import { type SessionTypes } from '@walletconnect/types';
import { type EvmRequests } from '@extension-base/services/request-service/types';
import type { AuthorizeRequest, MetadataRequest, SigningRequest } from '@extension-base/background/types/types';
import type {
  WalletConnectSessionRequest,
  WalletConnectNotSupportRequest,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';

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
    }
  | {
      type: 'signEvmRequests';
      requests: EvmRequests;
    };

export type SignRequestList = {
  substrate: SigningRequest[];
  evm: EvmRequests;
};
