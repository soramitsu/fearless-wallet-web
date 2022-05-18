import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountBalance } from '@/interfaces/balances';

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

export type balance = {
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

type Balance = {
  address: string;
  balance: AccountBalance;
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
  balances: Balance[];
};

export type SetNetworkStatusProps = {
  name: string;
  isActive: boolean;
};

export type SetNetworkBalancesProps = {
  name: string;
  balances: Balance[];
};

export type Networks = Network[];
