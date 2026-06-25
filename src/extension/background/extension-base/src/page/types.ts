import type { JsonRpcPayload, JsonRpcResponse } from '@walletconnect/jsonrpc-types';
import type {
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
} from '@extension-base/background/types/types';

export interface Handler {
  resolve: (data?: unknown) => void;
  reject: (error: Error) => void;
  subscriber?: (data: unknown) => void;
}

export type Handlers = Record<string, Handler>;

export interface SendRequest {
  <TMessageType extends MessageTypesWithNullRequest>(message: TMessageType): Promise<ResponseTypes[TMessageType]>;
  <TMessageType extends MessageTypesWithNoSubscriptions>(
    message: TMessageType,
    request: RequestTypes[TMessageType]
  ): Promise<ResponseTypes[TMessageType]>;
  <TMessageType extends MessageTypesWithSubscriptions>(
    message: TMessageType,
    request: RequestTypes[TMessageType],
    subscriber: (data: SubscriptionMessageTypes[TMessageType]) => void
  ): Promise<ResponseTypes[TMessageType]>;
}

export type FWEvmProvider = {
  provider?: FWEvmProvider;
  isConnected(): boolean;
};

export type SolanaChainId = 'solana:mainnet';

export type IrohaNetworkKey = 'taira' | 'nexus';
export type IrohaChainId = 'iroha:taira' | 'sora:nexus';

export interface IrohaAccountInfo {
  address: string;
  chain: IrohaChainId;
  name?: string;
  network: IrohaNetworkKey;
  publicKeyHex: string;
}

export interface IrohaConnectRequest {
  network?: IrohaNetworkKey;
  origin: string;
  silent?: boolean;
}

export interface IrohaConnectResponse {
  accounts: IrohaAccountInfo[];
}

export interface SolanaAccountInfo {
  address: string;
  name?: string;
  publicKey: string;
}

export interface SolanaConnectRequest {
  origin: string;
  silent?: boolean;
}

export interface SolanaConnectResponse {
  accounts: SolanaAccountInfo[];
}

export interface SolanaSignMessageRequest {
  display?: 'utf8' | 'hex';
  messageBase64: string;
  origin: string;
}

export interface SolanaSignMessageResponse {
  publicKey: string;
  signatureBase58: string;
  signatureBase64: string;
}

export interface SolanaSignTransactionRequest {
  origin: string;
  transactionBase64: string;
}

export interface SolanaSignTransactionResponse {
  publicKey: string;
  signatureBase58: string;
  signedTransactionBase64: string;
}

export type SolanaRpcCommitment = 'processed' | 'confirmed' | 'finalized';

export interface SolanaSignAndSendTransactionOptions {
  maxRetries?: number;
  preflightCommitment?: SolanaRpcCommitment;
  skipPreflight?: boolean;
}

export interface SolanaSignAndSendTransactionRequest {
  options?: SolanaSignAndSendTransactionOptions;
  origin: string;
  transactionBase64: string;
}

export interface SolanaSignAndSendTransactionResponse {
  publicKey: string;
  signature: string;
  signatureBase58: string;
  signedTransactionBase64: string;
}

export interface SolanaSignAllTransactionsRequest {
  origin: string;
  transactionsBase64: string[];
}

export interface SolanaSignAllTransactionsResponse {
  publicKey: string;
  signedTransactionsBase64: string[];
  signaturesBase58: string[];
}

export type SolanaSigningResponse =
  | SolanaSignAllTransactionsResponse
  | SolanaSignAndSendTransactionResponse
  | SolanaSignMessageResponse
  | SolanaSignTransactionResponse;

export interface SolanaPublicKeyLike {
  equals(other: SolanaPublicKeyLike): boolean;
  toBase58(): string;
  toBytes(): Uint8Array;
  toString(): string;
}

export type SolanaConnectInput = {
  onlyIfTrusted?: boolean;
  silent?: boolean;
};

export interface SolanaWalletStandardAccount {
  address: string;
  chains: readonly SolanaChainId[];
  features: readonly string[];
  publicKey: Uint8Array;
}

export interface FWSolanaProvider {
  readonly accounts: readonly SolanaWalletStandardAccount[];
  readonly chains: readonly SolanaChainId[];
  readonly connected: boolean;
  readonly features: Record<string, unknown>;
  readonly icon: string;
  readonly isConnected: boolean;
  readonly isFearlessWallet: true;
  readonly name: string;
  readonly publicKey: SolanaPublicKeyLike | null;
  readonly version: '1.0.0';
  connect(input?: SolanaConnectInput): Promise<SolanaConnectResponse>;
  disconnect(): Promise<void>;
  request<T = unknown>(request: { method: string; params?: unknown }): Promise<T>;
  signMessage(message: Uint8Array, display?: SolanaSignMessageRequest['display']): Promise<{
    publicKey: SolanaPublicKeyLike;
    signature: Uint8Array;
  }>;
  signAndSendTransaction<T = unknown>(
    transaction: T,
    options?: SolanaSignAndSendTransactionOptions
  ): Promise<{ signature: string }>;
  signTransaction<T = unknown>(transaction: T): Promise<T | Uint8Array>;
  signAllTransactions<T = unknown>(transactions: T[]): Promise<Array<T | Uint8Array>>;
}

export type IrohaConnectInput = {
  network?: IrohaNetworkKey;
  onlyIfTrusted?: boolean;
  silent?: boolean;
};

export interface FWIrohaProvider {
  readonly accounts: readonly IrohaAccountInfo[];
  readonly connected: boolean;
  readonly isConnected: boolean;
  readonly isFearlessWallet: true;
  readonly name: string;
  readonly publicKeyHex: string | null;
  readonly selectedAddress: string | null;
  readonly version: '1.0.0';
  connect(input?: IrohaConnectInput): Promise<IrohaConnectResponse>;
  disconnect(): Promise<void>;
  request<T = unknown>(request: { method: string; params?: unknown }): Promise<T>;
}

export type RequestEvmEvents = null;
export type EvmEventType =
  | 'connect'
  | 'disconnect'
  | 'accountsChanged'
  | 'chainChanged'
  | 'message'
  | 'data'
  | 'reconnect'
  | 'error';
export type EvmAccountsChangedPayload = string[];
export type EvmChainChangedPayload = string;
export type EvmConnectPayload = { chainId: EvmChainChangedPayload };
export type EvmDisconnectPayload = unknown;

export interface EvmEvent {
  type: EvmEventType;
  payload: EvmAccountsChangedPayload | EvmChainChangedPayload | EvmConnectPayload | EvmDisconnectPayload;
}

export interface EvmAppState {
  networkKey?: string;
  chainId?: string;
  isConnected?: boolean;
  listenEvents?: string[];
}
export type RequestEvmProviderSend = JsonRpcPayload;
export interface ResponseEvmProviderSend {
  error: Error | null;
  result?: JsonRpcResponse;
}
