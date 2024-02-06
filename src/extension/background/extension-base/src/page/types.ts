// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { type JsonRpcPayload, type JsonRpcResponse } from '@json-rpc-tools/utils';
import type {
  EvmProvider,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
} from '@extension-base/background/types/types';
export interface Handler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (data?: any) => void;
  reject: (error: Error) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscriber?: (data: any) => void;
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
  provider?: EvmProvider;
  isMetaMask: boolean;
  isFearlessWallet: boolean;
  version: string;
  isConnected(): boolean;
};

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
