import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { Currencies } from '@/interfaces/currencies';
import type { HistoryItem } from '@/interfaces/history';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeyringJson } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { AccountBalance } from '@/interfaces/balances';
import type { Mutations } from './mutations';
import type { ActionContext } from 'vuex';
import type { State } from './state';
import type { Networks, Network } from '@/interfaces/networks';
import type { AssetJson } from '@/interfaces/assets';
import type { TokensPriceJson, TokenPriceJson } from '@/interfaces/tokens';
import type { FiatJson } from '@/interfaces/common';

// getters
export type GetNetwork = (networkName: string) => Network;

export type GetTokenName = (tokenId: string) => string;

// Mutations
export type SetNetworksStatusProps = {
  networks: Networks;
};

export type SetAssetsProps = {
  assets: AssetJson[];
};

export type SetFiatsProps = {
  fiats: FiatJson[];
};

export type SetTokensPriceProps = {
  tokensPriceJson: TokensPriceJson;
};

export type SetCurrenciesProps = {
  currencies: Currencies;
};

export type SetHistoryProps = {
  history: HistoryItem;
  walletAddress: string;
  networkName: string;
  isPreviously: boolean;
};

export type SetAllNetworksIsLoaded = {
  value: boolean;
};

export type UpdateCurrencyProps = {
  tokenId: string;
  tokensPrice: TokenPriceJson;
  precision: number;
  selectedFiat: string;
};

export type UpdateCurrencyBalanceProps = {
  walletAddress: string;
  currency: {
    network: string;
    tokenId: string;
    balance: AccountBalance;
  };
};

export type SetNetworkActiveNodeProps = {
  network: string;
  name: string;
  url: string;
};

export type SetNetworkApi = {
  network: string;
  provider: WsProvider;
  api: ApiPromise;
};

// Actions
export type LoadNetworks = {
  url: string;
  autoConnectMs: number;
};

export type LoadAssets = {
  url: string;
};

export type LoadFiats = {
  url: string;
};

export type LoadHistory = {
  networkName: string;
  walletAddress: string;
  pageSize: number;
};

export type Accounts = Record<string, { type?: KeypairType; json: KeyringJson }> | SubjectInfo;

export type SubscribeToBalances = {
  accounts: Accounts;
  networksProps?: Networks;
};

export type ToggleActiveNode = {
  network: string;
  nodeName: string;
  nodeUrl: string;
  oldNodeUrl: string;
};

export type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
