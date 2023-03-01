import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Node } from '@/interfaces';

type TypesForMobile = {
  url: string;
  name: string;
};

type NetworkName = string;

interface ExternalApiElement {
  url: string;
  type: string;
}

interface Explorer extends ExternalApiElement {
  types: string[];
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
  type?: NetworkAssetsType;
};

type NetworkStatus = 'pending' | 'disconnected' | 'connected' | 'ready';

type NetworkJson = {
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
  NetworkJson,
  NetworkAssetsType,
  NetworkAssets,
  NetworkName,
  ExternalApi,
  ApiOptions,
  NetworkStatus,
};
