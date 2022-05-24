import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountBalance } from '@/interfaces/balances';
import { Currency } from '@/interfaces/currencies';

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

export type NetworkJson = {
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
  name: string;
  api: ApiPromise;
  provider: WsProvider;
  nodes: Nodes[];
  assets: Assets[];
  addressPrefix: number;
  isActive: boolean;
  isEthereumNetwork: boolean;
};

export type Networks = Network[];

export type SetNetworksStatusProps = {
  networks: Networks;
};

export type SetCurrenciesStatusProps = {
  walletAddress: string;
  currency: Currency;
};

export type SetNetworkStatusProps = {
  name: string;
  isActive: boolean;
};
