import type { MobileSigningContext } from '@extension-base/services/wallet-connect-service/mobileSigningContext';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';
import type { ParsedSignData, TonConnectTransaction, TonMessagePreview } from '@/util/tonConnect/protocol';
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
  mobileSession?: MobileSigningContext;
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

export type TonSigningMethod = 'sendTransaction' | 'signData';

/** What a signData request asks to sign, as the review shows it. */
export type TonSignDataPreview =
  | { type: 'text'; text: string }
  | { type: 'binary'; byteLength: number; bytesHex: string }
  | { type: 'cell'; schema: string; cellBase64: string };

/** A TON Connect request waiting in the popup. Only these fields reach the popup. */
export type TonRequestPayload = {
  account: {
    address: string;
    name?: string;
    publicKey: string;
  };
  /** The name the dApp's manifest gives; the origin, not this name, is what the review trusts. */
  appName: string;
  ecosystem: 'ton';
  id: string;
  method: TonSigningMethod;
  /** The page origin, as for the other queues. */
  url: string;
  origin: string;
  messages?: TonMessagePreview[];
  /** Unix seconds after which the request can no longer be sent. */
  validUntil?: number;
  signData?: TonSignDataPreview;
  /** The domain a signData signature binds: the page's host. */
  domain?: string;
};

export type TonRequests = Record<string, TonRequestPayload>;

export type TonSigningResponse =
  | { method: 'sendTransaction'; boc: string }
  | { method: 'signData'; signature: string; timestamp: number; domain: string };

export interface TonRequestsSubjectPayload extends Resolver<TonSigningResponse>, TonRequestPayload {
  /** The validated request the approval signs; it never leaves the background. */
  transaction?: TonConnectTransaction;
  signDataRequest?: ParsedSignData;
}

export type TonRequestsSubject = Record<string, TonRequestsSubjectPayload>;
