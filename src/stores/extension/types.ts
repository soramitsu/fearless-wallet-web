import { type SessionTypes } from '@walletconnect/types';
import { type EvmRequests, type SolanaRequests } from '@extension-base/services/request-service/types';
import type { MutableAction } from '@extension-base/services/action-capability-service';
import type { AuthorizeRequest, MetadataRequest, SigningRequest } from '@extension-base/background/types/types';
import type {
  WalletConnectSessionRequest,
  WalletConnectNotSupportRequest,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';

export interface Features {
  fiat: {
    moonpay: boolean;
    ramp: boolean;
  };
  /** Resolved by the same veto-only policy the background enforces. */
  actions: Record<MutableAction, boolean>;
  assetDiscoveryMode?: 'shadow' | 'visible';
  portfolio?: { assetDiscoveryMode?: 'shadow' | 'visible' };
}

export type SignRequests = {
  substrate: SigningRequest[];
  evm: EvmRequests;
  solana: SolanaRequests;
};

export type RequestsPayload =
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
    }
  | {
      type: 'signSolanaRequests';
      requests: SolanaRequests;
    };
