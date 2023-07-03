// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BalanceItem, CustomTokenType, NetWorkGroup } from '@extension-base/api/evm/types/ether';
import { NETWORK_STATUS } from './api/types/networks';
import type { AssetType } from '@/interfaces';
import { RelayChainName, ExternalApi } from '@/interfaces';

import { ContractType } from '@/interfaces/ether';

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

export type Asset = {
  id: string;
  type: AssetType;
  name: string; // ex: voucher ksm
  symbol: string; // ex: vksm
  currencyId?: string; // ex: ksm
  precision: number;
  priceId: string;
  icon: string;
  color: string;
  staking: string;
  purchaseProviders?: string[];
  isUtility?: true;
  isNative?: true;
  existentialDeposit?: string;
  smartContract?: string;
};

export interface NetworkJson {
  // General Information
  key: string; // Key of network in NetworkMap
  chain: string; // Name of the network
  icon: string; // Icon name, available with known network
  active: boolean; // Network is active or not
  // Provider Information
  isManual?: boolean;
  providers: Record<string, string>; // Predefined provider map
  currentProvider: string | null; // Current provider key
  // currentProviderMode: 'http' | 'ws'; // Current provider mode, compute depend on provider protocol. the feature need to know this to decide use subscribe or cronjob to use this features.
  customProviders?: Record<string, string>; // Custom provider map, provider name same with provider map
  // Metadata get after connect to provider
  genesisHash: string; // identifier for network
  groups: NetWorkGroup[];
  ss58Format: number;
  chainType?: 'substrate' | 'ethereum';
  crowdloanUrl?: string;
  disabled: boolean;
  // Ethereum related information for predefined network only
  isEthereum?: boolean; // Only show network with isEthereum=true when select one EVM account // user input
  evmChainId?: number;
  // isHybrid?: boolean;
  // Native token information
  nativeToken?: string;
  decimals?: number;
  // Other information
  coinGeckoKey: string; // Provider key to get token price from CoinGecko // user input
  blockExplorer?: string; // Link to block scanner to check transaction with extrinsic hash // user input
  abiExplorer?: string; // Link to block scanner to check transaction with extrinsic hash // user input
  dependencies?: string[]; // Auto active network in dependencies if current network is activated
  // getStakingOnChain?: boolean; // support get bonded on chain
  // supportBonding?: boolean;
  supportSmartContract?: ContractType[]; // if network supports PSP smart contracts
  apiStatus?: NETWORK_STATUS;
  requestId?: string;
  // from json
  chainId: string;
  parentId?: string;
  paraId?: string;
  name: string;
  externalApi?: ExternalApi;
  assets: Asset[];
  isEthereumNetwork?: boolean;
  customNodes: Node[];
  nodes: Node[];
  addressPrefix: number;
  types: TypesForMobile;
  options?: string[];
  xcm?: {
    xcmVersion: 'v1' | 'v2' | 'v3';
    availableAssets: string[];
    availableDestinations: {
      chainId: string;
      assets: string[];
    }[];
  };
}

export interface ChainRegistry {
  chainDecimals: number[];
  chainTokens: string[];
  assetsMap: Asset[];
}
