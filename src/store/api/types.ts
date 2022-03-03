import { ApiPromise, WsProvider } from '@polkadot/api';

export type Nodes = {
  url: string;
  name: string;
};

export type Assets = {
  assetId: string;
  staking?: string;
  purchaseProviders?: string[];
};

type Types = {
  url: string;
  name: string;
};

type ExternalApiElement = {
  url: string;
  type: string;
};

type Explorer = {
  types: string[];
  type: string;
  url: string;
};

type ExternalApi = {
  staking?: ExternalApiElement;
  history?: ExternalApiElement;
  crowdloans?: ExternalApiElement;
  explorers?: Explorer[];
};

export type FullNetwork = {
  chainId: string;
  parentId?: string;
  name: string;
  externalApi?: ExternalApi;
  assets: Assets[];
  nodes: Nodes[];
  icon: string;
  addressPrefix: number;
  types: Types;
  options?: string[];
};

type Network = {
  api: ApiPromise;
  provider: WsProvider;
  nodes: Nodes[];
  assets: Assets[];
  active: boolean;
};

export type SetNetworkStatusMutation = {
  name: string;
  active: boolean;
};

export type Networks = Record<string, Network>;
