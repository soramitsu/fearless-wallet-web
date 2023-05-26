import { NetworkFeesObject } from '@sora-substrate/util';
import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Node, TypeAsset } from '@/interfaces';

type SoraFees = {
  [key in keyof NetworkFeesObject]: string;
};

type TypesForMobile = {
  url: string;
  name: string;
};

type NetworkName = string;

type HistoryServiceType = 'subsquid' | 'giantsquid' | 'subquery';

interface ExternalApiElement {
  url: string;
  type: HistoryServiceType;
}

interface Explorer {
  types: string[];
  url: string;
  type: 'subscan' | 'polkascan';
}

type ExternalApi = {
  staking?: ExternalApiElement;
  history?: ExternalApiElement;
  crowdloans?: ExternalApiElement;
  explorers?: Explorer[];
};

type NetworkAssetsType =
  | 'ormlAsset'
  | 'vToken'
  | 'vsToken'
  | 'foreignAsset'
  | 'stable'
  | 'liquidCrowdloan'
  | 'stableAssetPoolToken'
  | 'equilibrium'
  | 'ormlChain'
  | 'soraAsset';

type NetworkAssets = {
  assetId: string;
  staking?: string;
  purchaseProviders?: string[];
  isUtility?: true;
  isNative?: true;
  type?: TypeAsset;
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
  fees?: SoraFees; // only Sora network
};

type Networks = Network[];

interface ApiOptions {
  apiRetry: number;
  nodeIndex: number;
  api?: ApiPromise;
  provider?: WsProvider;
}

export {
  Networks,
  Network,
  NetworkAssetsType,
  NetworkAssets,
  NetworkName,
  ExternalApi,
  ApiOptions,
  NetworkStatus,
  HistoryServiceType,
  SoraFees,
};
