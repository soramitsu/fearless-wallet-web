import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { HexString } from '@polkadot/util/types';
import type {
  Currencies,
  HistoryItem,
  AccountBalance,
  Networks,
  Network,
  NetworkAssetsType,
  AssetJson,
  AssetsPrice,
  AssetPrice,
  FiatJson,
} from '@/interfaces';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeyringJson } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/networks/state';
import type { Mutations } from '@/store/networks/mutations';
// getters
export type GetNetwork = (networkName: string) => Network;
export type GetNetworkGenesisHash = (networkName: string) => HexString;

export type GetAssetName = (assetId: string) => string;

export type GetAssetPrice = (assetId: string) => AssetPrice;

// Mutations
export type SetNetworksStatusProps = {
  networks: Networks;
};

export type SetAssetsJsonProps = {
  assetsJson: AssetJson[];
};

export type SetFiatsJsonProps = {
  fiats: FiatJson[];
};

export type SetAssetsPriceProps = {
  assetsPrice: AssetsPrice;
};

export type SetCurrenciesProps = {
  currencies: Currencies;
};

export type SetHistoryProps = {
  history: HistoryItem;
  walletAddress: string;
  networkName: string;
  isPreviously: boolean;
  assetId: string;
};

export type UpdateCurrencyBalanceProps = {
  walletAddress: string;
  network: string;
  assetId: string;
  balance: AccountBalance;
  parentId: string | undefined;
  type: NetworkAssetsType | undefined;
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
export type LoadJsons = {
  chainsUrl: string;
  assetsUrl: string;
  fiatsUrl: string;
};

export type LoadHistory = {
  networkName: string;
  walletAddress: string;
  assetId: string;
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
