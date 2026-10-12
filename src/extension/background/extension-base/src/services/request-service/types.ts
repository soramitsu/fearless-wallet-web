import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';
import type {
  SolanaSignMessageRequest,
  SolanaSignAndSendTransactionOptions,
  SolanaSignAndSendTransactionRequest,
  SolanaSigningResponse,
  SolanaSignAllTransactionsRequest,
  SolanaSignTransactionRequest,
} from '@extension-base/page/types';

export type WCSignRequest = Resolver<ResponseSigning> & {
  request: WalletConnectTransactionRequest;
};

export type DAppChainInfoPayload = {
  defaultChain?: string;
  url?: string;
};

export type EvmRequestParams = unknown;

export type EvmSigningContext = {
  // Legacy/unqualified queue data may display, but cannot pass approval validation.
  authorizationRevision?: number;
  account: { address: string; name?: string; isMobile: boolean };
  network: { name: string; chainId: string; genesisHash: string; provider?: string; symbol?: string; decimals?: number };
};

export type EvmRequestPayload = EvmSigningContext & {
  id: string;
  data: EvmRequestParams;
  method: string;
  url: string;
};

export type EvmRequests = Record<string, EvmRequestPayload>;

export interface EvmRequestsSubjectPayload extends Resolver<ResponseSigning>, EvmRequestPayload {}

export type EvmRequestsSubject = Record<string, EvmRequestsSubjectPayload>;

export type SolanaSigningMethod = 'signAllTransactions' | 'signAndSendTransaction' | 'signMessage' | 'signTransaction';

export type SolanaTransactionPreview = {
  accountCount?: number;
  addressTableLookupCount?: number;
  firstSigner?: string;
  instructionCount?: number;
  messageBytes?: number;
  parseError?: string;
  readonlySignedAccounts?: number;
  readonlyUnsignedAccounts?: number;
  recentBlockhash?: string;
  requiredSignatures?: number;
  signatureCount?: number;
  transactionBytes: number;
  version?: 'legacy' | 'v0';
};

export type SolanaTransactionSimulationPreview = {
  error?: string;
  logCount?: number;
  slot?: number;
  status: 'error' | 'failed' | 'pending' | 'success';
  unitsConsumed?: number;
};

export type SolanaTransactionFeePreview = {
  error?: string;
  lamports?: number;
  slot?: number;
  status: 'error' | 'pending' | 'ready' | 'unavailable';
};

export type SolanaRequestPayload = {
  account: {
    address: string;
    name?: string;
    publicKey: string;
  };
  display?: SolanaSignMessageRequest['display'];
  ecosystem: 'solana';
  fee?: SolanaTransactionFeePreview;
  id: string;
  messageBase64?: string;
  method: SolanaSigningMethod;
  options?: SolanaSignAndSendTransactionOptions;
  origin: string;
  simulation?: SolanaTransactionSimulationPreview;
  transactionBase64?: string;
  transactionPreview?: SolanaTransactionPreview;
  transactionPreviews?: SolanaTransactionPreview[];
  transactionsBase64?: string[];
  url: string;
};

export type SolanaRequests = Record<string, SolanaRequestPayload>;

export interface SolanaRequestsSubjectPayload extends Resolver<SolanaSigningResponse>, SolanaRequestPayload {
  authorizationRevision?: number;
}

export type SolanaSerializedTransactionRequest =
  | SolanaSignAllTransactionsRequest
  | SolanaSignAndSendTransactionRequest
  | SolanaSignTransactionRequest;

export type SolanaRequestsSubject = Record<string, SolanaRequestsSubjectPayload>;
