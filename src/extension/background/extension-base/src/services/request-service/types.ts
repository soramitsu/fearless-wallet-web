import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { AccountAuthType, Resolver, ResponseSigning } from '@extension-base/background/types/types';

export type WCSignRequest = Resolver<ResponseSigning> & {
  request: WalletConnectTransactionRequest;
};

export type DAppChainInfoPayload = {
  accessType: AccountAuthType;
  autoActive?: boolean;
  defaultChain?: string;
  url?: string;
};

export type EvmRequestPayload = {
  id: string;
  data: any;
  url: string;
};

export type EvmRequests = Record<string, EvmRequestPayload>;

export interface EvmRequestsSubjectPayload extends Resolver<ResponseSigning> {
  id: string;
  data: any;
  method: string;
  url: string;
}

export type EvmRequestsSubject = Record<string, EvmRequestsSubjectPayload>;
