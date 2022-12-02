import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { HexString } from '@polkadot/util/types';
import type {
  Currencies,
  HistoryItem,
  AccountBalance,
  Networks,
  Network,
  AssetJson,
  AssetsPrice,
  AssetPrice,
  FiatJson,
  NetworkStatus,
  Node,
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

export type GetNetworkStatus = (networkName: string) => NetworkStatus;

export type GetActiveNodesByNetwork = (networkName: string) => Node;

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
  address?: string;
};

export type SetHistoryProps = {
  history: HistoryItem;
  walletAddress: string;
  networkName: string;
  isPreviously: boolean;
  assetId: string;
  isMock?: true;
};

export type UpdateCurrencyBalanceProps = {
  walletAddress: string;
  network: string;
  assetId: string;
  balance: AccountBalance;
  parentId: string | undefined;
};

export type SetActiveNodeProps = {
  network: string;
  name: string;
  url: string;
  saveNode: boolean;
};

export type SetNetworkApiProps = {
  network: string;
  provider?: WsProvider;
  api?: ApiPromise;
};

export type SetNetworkStatusProps = {
  network: string;
  status: NetworkStatus;
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

export type CustomAccounts = Record<string, { type?: KeypairType; json: KeyringJson }>;

export type SubscribeToBalances = {
  accounts: CustomAccounts | SubjectInfo;
  networksProps?: Networks;
};

export type ToggleActiveNode = {
  network: string;
  nodeName?: string;
  nodeUrl?: string;
  oldNodeUrl?: string;
};

export type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
