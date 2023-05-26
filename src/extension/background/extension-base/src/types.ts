// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BalanceItem, CustomTokenType, NetworkJson } from './api/evm/types/ether';
import { AssetJson, ExternalApi, NetworkAssets, RelayChainName } from '@/interfaces';

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

type Node = {
  url: string;
  name: string;
};

export type CurrencyMock = {
  mainNetwork: string;
  assetId: string;
  name: string;
  symbol: string;
  displayName: string;
  relayChain: RelayChainName;
  icon: string;
  providers: string[];
  balances: BalanceItem[];
};

export interface NetworkJsonOld extends NetworkJson {
  chainId: string;
  parentId?: string;
  name: string;
  externalApi?: ExternalApi;
  assets: NetworkAssets[];
  isEthereumNetwork?: boolean;
  customNodes: Node[];
  nodes: Node[];
  icon: string;
  addressPrefix: number;
  types: TypesForMobile;
  options?: string[];
  xcm?: {
    xcmVersion: 'v1' | 'v3';
    availableAssets: string[];
    availableDestinations: { chainId: string; assets: string[] }[];
  };
}

export interface ChainRegistry {
  chainDecimals: number[];
  chainTokens: string[];
  tokenMap: AssetJson[];
}
