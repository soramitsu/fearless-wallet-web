import { NetworkFeesObject } from '@sora-substrate/util';
import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Node } from '@/interfaces';

type RelayChainName = 'polkadot' | 'kusama' | 'westend' | 'rococo';

type SoraFees = {
  [key in keyof NetworkFeesObject]: string;
};

type NetworkName = string;

type HistoryServiceType = 'subsquid' | 'giantsquid' | 'subquery' | 'etherscan';

interface ExternalApiElement {
  url: string;
  type: HistoryServiceType;
}

interface Explorer {
  types: string[];
  url: string;
  type: 'subscan' | 'polkascan' | 'etherscan';
}

type ExternalApi = {
  staking?: ExternalApiElement;
  history?: ExternalApiElement;
  crowdloans?: ExternalApiElement;
  explorers?: Explorer[];
};

type AssetType =
  | 'normal'
  | 'ormlAsset'
  | 'vToken'
  | 'vsToken'
  | 'foreignAsset'
  | 'stable'
  | 'liquidCrowdloan'
  | 'stableAssetPoolToken'
  | 'equilibrium'
  | 'ormlChain'
  | 'soraAsset'
  | 'erc20'
  | 'token2'
  | 'assets'
  | 'assetId'; // TODO add

type NetworkAssets = {
  assetId: string;
  staking?: string;
  purchaseProviders?: string[];
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
  assets: NetworkAssets[];
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

type Networks = Network[];

interface ApiOptions {
  apiRetry: number;
  nodeIndex: number;
  api?: ApiPromise;
  provider?: WsProvider;
}

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
  Networks,
  Network,
  AssetType,
  NetworkName,
  ExternalApi,
  ApiOptions,
  NetworkStatus,
  HistoryServiceType,
  SoraFees,
  RelayChainName,
  EthereumHistoryResponse,
  EthereumHistoryData,
  EthereumTokenHistoryData,
};
