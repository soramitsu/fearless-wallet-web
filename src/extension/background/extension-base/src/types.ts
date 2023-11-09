import { CustomTokenType } from '@extension-base/api/evm/types/ether';
import { NETWORK_STATUS } from './api/types/networks';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import type { AssetType, BuyProvider, XcmVersion } from '@/interfaces';
import { ExternalApi } from '@/interfaces';

export interface Message extends MessageEvent {
  data: {
    error?: string;
    id: string;
    origin: string;
    response?: string;
    value?: any;
  };
}

export interface RequestTransactionHistoryGet {
  address: string;
  networkKey: string;
  token?: string;
}

export interface DeleteCustomTokenParams {
  id: string;
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
  purchaseProviders?: BuyProvider[];
  isUtility?: true;
  isNative?: true;
  existentialDeposit?: string;
};

type XcmAssets = {
  id: string;
  symbol: string;
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
  currentProvider: string; // Current provider key
  // currentProviderMode: 'http' | 'ws'; // Current provider mode, compute depend on provider protocol. the feature need to know this to decide use subscribe or cronjob to use this features.
  customProviders?: Record<string, string>; // Custom provider map, provider name same with provider map
  // Metadata get after connect to provider
  genesisHash: string; // identifier for network
  ss58Format: number;
  chainType?: 'substrate' | 'ethereum';
  disabled: boolean;
  // Ethereum related information for predefined network only
  isEthereum?: boolean; // Only show network with isEthereum=true when select one EVM account // user input
  // Native token information
  decimals?: number;
  // Other information
  networkStatus?: NETWORK_STATUS;
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
  rank?: number;
  favorite: string[];
  xcm?: {
    xcmVersion: XcmVersion;
    availableAssets: XcmAssets[];
    availableDestinations: {
      chainId: string;
      assets: XcmAssets[];
    }[];
  };
}

export interface ChainRegistry {
  chainDecimals: number[];
  chainTokens: string[];
  assetsMap: Asset[];
}

export interface FWKeyringMeta extends KeyringPair$Meta {
  isMobile?: boolean;
  wcTopic?: string;
}
