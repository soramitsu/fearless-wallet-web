import { ApiPromise, WsProvider } from '@polkadot/api';
import { Currencies, Currency } from '@/interfaces/currencies';
import { Subscription } from 'rxjs';

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

type WalletAddress = string;

type Network = {
  name: string;
  api: ApiPromise;
  provider: WsProvider;
  nodes: Nodes[];
  assets: Assets[];
  addressPrefix: number;
  isEthereumNetwork: boolean;
  subscriptionsBalances?: Record<WalletAddress, Subscription>;
};

export type Networks = Network[];

export type AssetsJson = {
  id: string;
  chainId: string;
  precision: string;
  priceId?: string;
  icon: string;
};

type NetworkName = string;

export type TokenPriceJson = {
  usd: number;
  usd_24h_change: number; // eslint-disable-line
};

export type TokensPriceJson = Record<NetworkName, TokenPriceJson>;

export type TokenPrice = {
  usd: number;
  usd24HoursChange: number;
};

export type TokensPrice = Record<NetworkName, TokenPrice>;

// Mutations
export type SetNetworksStatusProps = {
  networks: Networks;
};

export type SetAssetsProps = {
  assets: AssetsJson[];
};

export type SetTokensPriceProps = {
  tokensPrice: TokensPrice;
};

export type UpdateCurrencyProps = {
  walletAddress: string;
  currency: Currency;
};

export type SetCurrenciesProps = {
  currencies: Currencies;
};

export type SetSubscriptionsBalancesProps = {
  walletAddress: string;
  subscriptionsBalances: Subscription;
  networkName: string;
};

// Actions
export type LoadNetworksInfo = {
  url: string;
  autoConnectMs: number;
};

export type LoadAssets = {
  url: string;
  autoConnectMs: number;
};
