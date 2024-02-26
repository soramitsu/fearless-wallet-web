import { type SessionTypes } from '@walletconnect/types';
import {
  type AuthorizeRequest,
  type MetadataRequest,
  type SigningRequest,
} from '@extension-base/background/types/types';
import {
  type WalletConnectSessionRequest,
  type WalletConnectNotSupportRequest,
  type WalletConnectTransactionRequest,
  type ConfirmationsEvmQueue,
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
      requests: ConfirmationsEvmQueue;
    };

export type SignRequestList = {
  substrate: SigningRequest[];
  evm: ConfirmationsEvmQueue;
};
