// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { CustomTokenType } from './api/evm/types/ether';
import { ExternalApi, NetworkAssets } from '@/interfaces';

export interface Message extends MessageEvent {
  data: {
    error?: string;
    id: string;
    origin: string;
    response?: string;
    subscription?: string;
  };
}

export interface TransactionHistoryItemType {
  time: number | string;
  networkKey: string;
  change: string;
  changeSymbol?: string; // if undefined => main token
  fee?: string;
  feeSymbol?: string;
  // if undefined => main token, sometime "fee" uses different token than "change"
  // ex: sub token (DOT, AUSD, KSM, ...) of Acala, Karaura uses main token to pay fee
  isSuccess: boolean;
  action: 'send' | 'received';
  extrinsicHash: string;
  origin?: 'app' | 'network';
  eventIdx?: number | null;
}

export interface RequestTransactionHistoryAdd {
  address: string;
  networkKey: string;
  item: TransactionHistoryItemType;
}

export interface RequestTransactionHistoryGet {
  address: string;
  networkKey: string;
  token?: string;
}

export interface DeleteCustomTokenParams {
  smartContract: string;
  chain: string;
  type: CustomTokenType;
}

/// EVM transaction
export type NestedArray<T> = T | NestedArray<T>[];

/// EVM Contract Input

export interface EVMTransactionArg {
  name: string;
  type: string;
  value: string;
  children?: EVMTransactionArg[];
}

export interface ParseEVMTransactionData {
  method: string;
  methodName: string;
  args: EVMTransactionArg[];
}

export interface RequestParseEVMContractInput {
  data: string;
  contract: string;
  chainId: number;
}

export interface ResponseParseEVMContractInput {
  result: ParseEVMTransactionData | string;
}
type TypesForMobile = {
  url: string;
  name: string;
};
export type NetworkJsonOld = {
  chainId: string;
  parentId?: string;
  paraId?: string;
  name: string;
  externalApi?: ExternalApi;
  assets: NetworkAssets[];
  nodes: Node[];
  icon: string;
  addressPrefix: number;
  types: TypesForMobile;
  options?: string[];
};
