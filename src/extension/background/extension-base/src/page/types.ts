import type { JsonRpcPayload, JsonRpcResponse, RequestArguments } from '@json-rpc-tools/utils';
import type { JsonRpcRequest } from 'json-rpc-engine';
import type {
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
} from '@extension-base/background/types/types';

type JsonRpcParams = (JsonRpcPayload & { params?: unknown })['params'];

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

export type JsonRpcCallback<T> = (error: Error | null, result?: JsonRpcResponse<T>) => void;

export interface FWEvmProvider {
  provider?: FWEvmProvider;
  isConnected(): boolean;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  once(event: string | symbol, listener: (...args: unknown[]) => void): this;
  off(event: string | symbol, listener: (...args: unknown[]) => void): this;
  addListener(event: string | symbol, listener: (...args: unknown[]) => void): this;
  removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this;
  removeAllListeners(event?: string | symbol): this;
  enable(origin?: string): Promise<string[]>;
  request<T>(args: RequestArguments): Promise<T>;
  send<T>(
    methodOrPayload: string | SendSyncJsonRpcRequest | JsonRpcRequest<unknown>,
    callbackOrParams?: JsonRpcCallback<T> | JsonRpcParams
  ): Promise<unknown> | JsonRpcResponse<T> | void;
  sendAsync<T>(payload: JsonRpcRequest<T>, callback: JsonRpcCallback<T>): void | Promise<void>;
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

export interface SendSyncJsonRpcRequest extends JsonRpcRequest<unknown> {
  method: 'net_version';
}
