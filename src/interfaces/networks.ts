import type { NetworkFeesObject } from '@/types/sora';
import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Node } from '@/interfaces';
import { type TON_MAINNET, type TON_TESTNET } from '@/consts/networks';

const BASE_HISTORY_SERVICE_TYPES = [
  'ton',
  'subsquid',
  'giantsquid',
  'subquery',
  'etherscan',
  'sora',
  'oklink',
  'zeta',
] as const;

type BaseHistoryServiceType = (typeof BASE_HISTORY_SERVICE_TYPES)[number];

type HistoryServiceType = BaseHistoryServiceType | `staking${Capitalize<BaseHistoryServiceType>}` | `staking${string}`;

const BASE_ASSET_TYPES = [
  'normal',
  'ormlAsset',
  'vToken',
  'vsToken',
  'foreignAsset',
  'stable',
  'liquidCrowdloan',
  'stableAssetPoolToken',
  'equilibrium',
  'ormlChain',
  'soraAsset',
  'erc20',
  'token2',
  'assets',
  'assetId',
  'ton',
  'jetton',
] as const;

type BaseAssetType = (typeof BASE_ASSET_TYPES)[number];

type RelayChainName =
  | 'polkadot'
  | 'kusama'
  | 'westend'
  | 'rococo'
  | 'ethereum'
  | typeof TON_MAINNET
  | typeof TON_TESTNET;

type SoraFees = {
  [key in keyof NetworkFeesObject]: string;
};

type NetworkName = string;
type NetworkGroup = 'all' | 'popular' | 'favorites';
type NetworkFilter = NetworkName | NetworkGroup;
type NormalizedNetworkName = Lowercase<NetworkName>;

interface ExternalApiElement {
  url: string;
  type: HistoryServiceType;
}

interface Explorer {
  types: string[];
  url: string;
  type: 'subscan' | 'polkascan' | 'etherscan' | 'oklink' | 'tonviewer';
}

type ExternalApi = {
  staking?: ExternalApiElement;
  history?: ExternalApiElement;
  crowdloans?: ExternalApiElement;
  pricing: ExternalApiElement;
  explorers?: Explorer[];
};

type AssetType = BaseAssetType | `assetId:${string}`;

type BuyProvider = 'moonpay' | 'ramp';

type NetworkAsset = {
  assetId: string;
  staking?: string;
  purchaseProviders?: BuyProvider[];
  isUtility?: true;
  isNative?: true;
  type?: AssetType;
};

type NetworkStatus = 'pending' | 'disconnected' | 'connected' | 'ready';

type Network = {
  name: string;
  label: string;
  icon: string;
  api?: ApiPromise;
  provider?: WsProvider;
  nodes: Node[];
  assets: NetworkAsset[];
  chainId: string;
  parentId?: string;
  paraId?: string;
  addressPrefix: number;
  isEthereumNetwork: boolean;
  settings: Record<string, any>;
  externalApi: ExternalApi;
  status: NetworkStatus;
  rank?: number;
  fees?: SoraFees; // only Sora network
};

type EthereumHistoryData = {
  blockHash: string;
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  functionName: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  isError: string;
  methodId: string;
  nonce: string;
  timeStamp: string;
  to: string;
  transactionIndex: string;
  txreceipt_status: string;
  value: string;
};

type EthereumTokenHistoryData = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
};
type EthereumHistoryResponse<T> = {
  message: string;
  result: T[];
  status: string;
};

export {
  Network,
  BuyProvider,
  AssetType,
  NetworkName,
  NetworkGroup,
  NetworkFilter,
  ExternalApi,
  HistoryServiceType,
  BASE_HISTORY_SERVICE_TYPES,
  BASE_ASSET_TYPES,
  SoraFees,
  RelayChainName,
  EthereumHistoryResponse,
  EthereumHistoryData,
  EthereumTokenHistoryData,
  NormalizedNetworkName,
};
