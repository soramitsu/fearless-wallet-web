import { ContractType } from '@/interfaces/ether';

export enum APIItemState {
  PENDING = 'pending',
  READY = 'ready',
  CACHED = 'cached',
  ERROR = 'error',
  NOT_SUPPORT = 'not_support',
}
export interface BalanceChildItem {
  reserved: string;
  frozen: string;
  free: string;
  decimals: number;
}

export interface BalanceItem {
  state: APIItemState;
  free?: string;
  reserved?: string;
  miscFrozen?: string;
  feeFrozen?: string;
  children?: Record<string, BalanceChildItem>;
  timestamp?: number;
}

export enum CustomTokenType {
  erc20 = 'erc20',
}

export interface CustomToken {
  // general interface for all kinds of tokens
  smartContract: string;
  chain: string;
  type: CustomTokenType;

  name?: string;
  symbol?: string;
  decimals?: number;
  isCustom?: boolean;
  isDeleted?: boolean;
  image?: string;
}

export interface CustomTokenJson {
  [CustomTokenType.erc20]: CustomToken[];
}

export enum NETWORK_STATUS {
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected',
  PENDING = 'pending',
}

export type NetWorkGroup =
  | 'RELAY_CHAIN'
  | 'POLKADOT_PARACHAIN'
  | 'KUSAMA_PARACHAIN'
  | 'MAIN_NET'
  | 'TEST_NET'
  | 'UNKNOWN';

export interface NetworkJson {
  // General Information
  key: string; // Key of network in NetworkMap
  chain: string; // Name of the network
  icon?: string; // Icon name, available with known network
  active: boolean; // Network is active or not

  // Provider Information
  providers: Record<string, string>; // Predefined provider map
  currentProvider: string | null; // Current provider key
  currentProviderMode: 'http' | 'ws'; // Current provider mode, compute depend on provider protocol. the feature need to know this to decide use subscribe or cronjob to use this features.
  customProviders?: Record<string, string>; // Custom provider map, provider name same with provider map

  // Metadata get after connect to provider
  genesisHash: string; // identifier for network
  groups: NetWorkGroup[];
  ss58Format: number;
  paraId?: number;
  chainType?: 'substrate' | 'ethereum';
  crowdloanUrl?: string;

  // Ethereum related information for predefined network only
  isEthereum?: boolean; // Only show network with isEthereum=true when select one EVM account // user input
  evmChainId?: number;

  isHybrid?: boolean;

  // Native token information
  nativeToken?: string;
  decimals?: number;

  // Other information
  coinGeckoKey?: string; // Provider key to get token price from CoinGecko // user input
  blockExplorer?: string; // Link to block scanner to check transaction with extrinsic hash // user input
  abiExplorer?: string; // Link to block scanner to check transaction with extrinsic hash // user input
  dependencies?: string[]; // Auto active network in dependencies if current network is activated
  getStakingOnChain?: boolean; // support get bonded on chain
  supportBonding?: boolean;
  supportSmartContract?: ContractType[]; // if network supports PSP smart contracts

  apiStatus?: NETWORK_STATUS;
  requestId?: string;
}

export type TokenInfo = {
  isMainToken: boolean;
  symbol: string;
  symbolAlt?: string; // Alternate display for symbol
  contractAddress?: string;
  type?: CustomTokenType; // to differentiate custom tokens from native tokens
  decimals: number;
  name: string;
  coinGeckoKey?: string;
  // TODO: unify specialOption, assetId, assetIndex
  specialOption?: object;
  assetId?: string; // for moon assets
  assetIndex?: number | string;
};
