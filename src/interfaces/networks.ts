import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Node } from '@/interfaces/nodes';

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
  | 'ormlChain';

type NetworkAssets = {
  assetId: string;
  staking?: string;
  purchaseProviders?: string[];
  isUtility?: true;
  type?: NetworkAssetsType;
};

type NetworkJson = {
  chainId: string;
  parentId?: string;
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
  api: ApiPromise;
  provider: WsProvider;
  nodes: Node[];
  assets: NetworkAssets[];
  chainId: string;
  parentId?: string;
  addressPrefix: number;
  isEthereumNetwork: boolean;
  settings: Record<string, any>;
  externalApi: ExternalApi;
};

type DisconnectNetwork = Omit<Network, 'api' | 'provider'>;

type DisconnectNetworks = DisconnectNetwork[];

type Networks = Network[];

export {
  DisconnectNetworks,
  Networks,
  Network,
  NetworkJson,
  NetworkAssetsType,
  NetworkAssets,
  NetworkName,
  ExternalApi,
};
