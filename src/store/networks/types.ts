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
import type { WalletAddress } from '@/interfaces/common';

export type Node = {
  url: string;
  name: string;
};

export type ActiveNodes = Record<WalletAddress, Node>;

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
  chainId: string;
  addressPrefix: number;
  isEthereumNetwork: boolean;
  settings: Record<string, any>;
  externalApi: ExternalApi;
};

type DisconnectNetwork = Omit<Network, 'api' | 'provider'>;

export type DisconnectNetworks = DisconnectNetwork[];

export type Networks = Network[];

export type AssetJson = {
  id: string;
  chainId: string;
  precision: string;
  priceId?: string;
  icon: string;
};

export type FiatJson = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
};

type NetworkName = string;
type TokenName = string;

/* eslint-disable */
export type TokenPriceJson = {
  aed: number;
  aed_24h_change: number;
  ars: number;
  ars_24h_change: number;
  aud: number;
  aud_24h_change: number;
  bdt: number;
  bdt_24h_change: number;
  bhd: number;
  bhd_24h_change: number;
  bmd: number;
  bmd_24h_change: number;
  brl: number;
  brl_24h_change: number;
  cad: number;
  cad_24h_change: number;
  chf: number;
  chf_24h_change: number;
  clp: number;
  clp_24h_change: number;
  cny: number;
  cny_24h_change: number;
  czk: number;
  czk_24h_change: number;
  dkk: number;
  dkk_24h_change: number;
  eur: number;
  eur_24h_change: number;
  gbp: number;
  gbp_24h_change: number;
  hkd: number;
  hkd_24h_change: number;
  huf: number;
  huf_24h_change: number;
  idr: number;
  idr_24h_change: number;
  ils: number;
  ils_24h_change: number;
  inr: number;
  inr_24h_change: number;
  jpy: number;
  jpy_24h_change: number;
  krw: number;
  krw_24h_change: number;
  kwd: number;
  kwd_24h_change: number;
  lkr: number;
  lkr_24h_change: number;
  mmk: number;
  mmk_24h_change: number;
  mxn: number;
  mxn_24h_change: number;
  myr: number;
  myr_24h_change: number;
  ngn: number;
  ngn_24h_change: number;
  nok: number;
  nok_24h_change: number;
  nzd: number;
  nzd_24h_change: number;
  php: number;
  php_24h_change: number;
  pkr: number;
  pkr_24h_change: number;
  pln: number;
  pln_24h_change: number;
  rub: number;
  rub_24h_change: number;
  sar: number;
  sar_24h_change: number;
  sek: number;
  sek_24h_change: number;
  sgd: number;
  sgd_24h_change: number;
  thb: number;
  thb_24h_change: number;
  try: number;
  try_24h_change: number;
  twd: number;
  twd_24h_change: number;
  uah: number;
  uah_24h_change: number;
  usd: number;
  usd_24h_change: number;
  vef: number;
  vef_24h_change: number;
  vnd: number;
  vnd_24h_change: number;
  xdr: number;
  xdr_24h_change: number;
  zar: number;
  zar_24h_change: number;
  /* eslint-enable */
};

export type TokensPriceJson = Record<NetworkName | TokenName, TokenPriceJson>;

export type KeyTokenPriceJson = keyof TokenPriceJson;

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
};

export type SetAllNetworksIsLoaded = {
  value: boolean;
};

export type UpdateCurrencyProps = {
  token: string;
  tokensPrice: TokenPriceJson;
  precision: number;
  selectedFiat: string;
};

export type UpdateCurrencyBalanceProps = {
  walletAddress: string;
  currency: {
    network: string;
    token: string;
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
  historyExternalApi: ExternalApiElement;
  walletAddress: string;
};

export type Accounts = Record<string, { type?: KeypairType; json: KeyringJson }> | SubjectInfo;

export type SubscribeToBalances = {
  accounts: Accounts;
  loadHistory: boolean;
  networksProps?: Networks;
};

export type ToggleActiveNode = {
  network: string;
  nodeName: string;
  nodeUrl: string;
  oldNodeUrl: string;
};

export type Commit = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
};

export type AugmentedActionContext = Commit & Omit<ActionContext<State, any>, 'commit'>;
