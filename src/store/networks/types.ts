import { ApiPromise, WsProvider } from '@polkadot/api';
import { Subscription } from 'rxjs';
import type { Currencies, AvailableInNetworks } from '@/interfaces/currencies';
import type { HistoryItem } from '@/interfaces/history';
import type { WalletAddress } from '@/interfaces/common';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeypairType } from '@polkadot/util-crypto/types';

export type Node = {
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

interface ExternalApiElement {
  url: string;
  type: string;
}

interface Explorer extends ExternalApiElement {
  types: string[];
}

export type ExternalApi = {
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
  nodes: Node[];
  icon: string;
  addressPrefix: number;
  types: Types;
  options?: string[];
};

type Network = {
  name: string;
  api: ApiPromise;
  provider: WsProvider;
  nodes: Node[];
  assets: Assets[];
  addressPrefix: number;
  isEthereumNetwork: boolean;
  settings: Record<string, any>;
  externalApi: ExternalApi;
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

export type SetCurrenciesProps = {
  currencies: Currencies;
};

export type SetHistoryProps = {
  history: HistoryItem;
  walletAddress: string;
  networkName: string;
};

export type SetAllNetworksIsLoaded = {
  value: boolean;
};

export type SetSubscriptionsBalancesProps = {
  walletAddress: string;
  subscriptionsBalances: Subscription;
  networkName: string;
};

export type UpdateCurrencyProps = {
  walletAddress: string;
  currency: {
    mainNetwork: string;
    token: string;
    price: number;
    usd24HoursChange: number;
    precision: number;
    availableInNetworks: AvailableInNetworks[];
  };
};

export type UpdateActiveNodeProps = {
  networkName: string;
  provider: WsProvider;
  api: ApiPromise;
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

export type LoadHistory = {
  historyExternalApi: ExternalApiElement;
  walletAddress: string;
};

export type Accounts = Record<string, { type?: KeypairType }> | SubjectInfo;

export type SubscribeToBalances = {
  accounts: Accounts;
  loadHistory: boolean;
  networksProps?: Networks;
};

export type UpdateActiveNode = {
  networkName: string;
  nodeUrl: string;
  oldNodeUrl: string;
};
