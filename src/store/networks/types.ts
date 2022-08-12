import { ApiPromise, WsProvider } from '@polkadot/api';
import { Subscription } from 'rxjs';
import type { Currencies } from '@/interfaces/currencies';
import type { HistoryItem } from '@/interfaces/history';
import type { WalletAddress } from '@/interfaces/common';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeyringJson } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { AccountBalance } from '@/interfaces/balances';

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
  chainId: string;
  addressPrefix: number;
  isEthereumNetwork: boolean;
  settings: Record<string, any>;
  externalApi: ExternalApi;
  subscriptionsBalances?: Record<WalletAddress, Subscription>;
};

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

export type TokenPriceJson = {
  aed: number;
  aed_24h_change: number; // eslint-disable-line
  ars: number;
  ars_24h_change: number; // eslint-disable-line
  aud: number;
  aud_24h_change: number; // eslint-disable-line
  bdt: number;
  bdt_24h_change: number; // eslint-disable-line
  bhd: number;
  bhd_24h_change: number; // eslint-disable-line
  bmd: number;
  bmd_24h_change: number; // eslint-disable-line
  brl: number;
  brl_24h_change: number; // eslint-disable-line
  cad: number;
  cad_24h_change: number; // eslint-disable-line
  chf: number;
  chf_24h_change: number; // eslint-disable-line
  clp: number;
  clp_24h_change: number; // eslint-disable-line
  cny: number;
  cny_24h_change: number; // eslint-disable-line
  czk: number;
  czk_24h_change: number; // eslint-disable-line
  dkk: number;
  dkk_24h_change: number; // eslint-disable-line
  eur: number;
  eur_24h_change: number; // eslint-disable-line
  gbp: number;
  gbp_24h_change: number; // eslint-disable-line
  hkd: number;
  hkd_24h_change: number; // eslint-disable-line
  huf: number;
  huf_24h_change: number; // eslint-disable-line
  idr: number;
  idr_24h_change: number; // eslint-disable-line
  ils: number;
  ils_24h_change: number; // eslint-disable-line
  inr: number;
  inr_24h_change: number; // eslint-disable-line
  jpy: number;
  jpy_24h_change: number; // eslint-disable-line
  krw: number;
  krw_24h_change: number; // eslint-disable-line
  kwd: number;
  kwd_24h_change: number; // eslint-disable-line
  lkr: number;
  lkr_24h_change: number; // eslint-disable-line
  mmk: number;
  mmk_24h_change: number; // eslint-disable-line
  mxn: number;
  mxn_24h_change: number; // eslint-disable-line
  myr: number;
  myr_24h_change: number; // eslint-disable-line
  ngn: number;
  ngn_24h_change: number; // eslint-disable-line
  nok: number;
  nok_24h_change: number; // eslint-disable-line
  nzd: number;
  nzd_24h_change: number; // eslint-disable-line
  php: number;
  php_24h_change: number; // eslint-disable-line
  pkr: number;
  pkr_24h_change: number; // eslint-disable-line
  pln: number;
  pln_24h_change: number; // eslint-disable-line
  rub: number;
  rub_24h_change: number; // eslint-disable-line
  sar: number;
  sar_24h_change: number; // eslint-disable-line
  sek: number;
  sek_24h_change: number; // eslint-disable-line
  sgd: number;
  sgd_24h_change: number; // eslint-disable-line
  thb: number;
  thb_24h_change: number; // eslint-disable-line
  try: number;
  try_24h_change: number; // eslint-disable-line
  twd: number;
  twd_24h_change: number; // eslint-disable-line
  uah: number;
  uah_24h_change: number; // eslint-disable-line
  usd: number;
  usd_24h_change: number; // eslint-disable-line
  vef: number;
  vef_24h_change: number; // eslint-disable-line
  vnd: number;
  vnd_24h_change: number; // eslint-disable-line
  xdr: number;
  xdr_24h_change: number; // eslint-disable-line
  zar: number;
  zar_24h_change: number; // eslint-disable-line
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

export type SetSubscriptionsBalancesProps = {
  walletAddress: string;
  subscriptionsBalances: Subscription;
  networkName: string;
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

export type UpdateActiveNodeProps = {
  networkName: string;
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

export type UpdateActiveNode = {
  networkName: string;
  nodeUrl: string;
  oldNodeUrl: string;
};
