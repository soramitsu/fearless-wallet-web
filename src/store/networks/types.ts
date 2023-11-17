import type { NetworkJson } from '@extension-base/types';
import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { HexString } from '@polkadot/util/types';
import type {
  SubqueryHistory,
  AccountBalance,
  Networks,
  AssetPrice,
  FiatJson,
  NetworkStatus,
  Node,
  NetworkName,
  HistoryServiceType,
  GiantsquidHistoryItem,
  HistoryElement,
} from '@/interfaces';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeyringJson } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/networks/state';
import type { Mutations } from '@/store/networks/mutations';

// getters
export type GetNetwork = (networkName: string) => NetworkJson;
export type GetNetworkGenesisHash = (networkName: NetworkName) => HexString;
export type GetAssetIcon = (assetId: string) => string;
export type GetAssetPrice = (priceId: string) => AssetPrice;
export type GetActiveNodesByNetwork = (networkName: NetworkName) => Node;

// Mutations
export type SetNetworksStatusProps = {
  networks: NetworkJson[];
};

export type SetNetworkFavoriteProps = {
  networksName: string;
  address: string;
};
export type RemoveNetworkFavoriteProps = {
  networksName: string;
  index: number;
};

export type SetFiatsJsonProps = {
  fiats: FiatJson[];
};

export type SetAssetsPriceProps = {
  tokenPriceMap: Record<string, number>;
  tokenPriceChange: Record<string, number>;
};

export type SetAssetsPriceIntervalProps = {
  interval: NodeJS.Timer;
};

export type History = SubqueryHistory | GiantsquidHistoryItem[] | HistoryElement[];

export type SetHistoryProps = {
  history: History;
  walletAddress: string;
  networkName: NetworkName;
  assetId: string;
  serviceType: HistoryServiceType;
};

export type UpdateCurrencyBalanceProps = {
  walletAddress: string;
  network: NetworkName;
  assetId: string;
  balance: AccountBalance;
  parentId: string | undefined;
};

export type SetActiveNodeProps = {
  network: NetworkName;
  name: string;
  url: string;
  saveNode: boolean;
};

export type SetNetworkApiProps = {
  network: NetworkName;
  provider?: WsProvider;
  api?: ApiPromise;
};

export type SetNetworkStatusProps = {
  network: NetworkName;
  status: NetworkStatus;
};

export type SetSoraFee = {
  fee: string;
};

// Actions
export type FetchHistory = {
  networkName: NetworkName;
  assetId: string;
  address?: string;
};

export type ToggleFavorite = {
  networkName: NetworkName;
  address: string;
};

export type CustomAccounts = Record<string, { type?: KeypairType; json: KeyringJson }>;

export type SubscribeToBalances = {
  accounts: CustomAccounts | SubjectInfo;
  networksProps?: Networks;
};

export type ToggleActiveNode = {
  network: NetworkName;
  nodeName?: string;
  nodeUrl?: string;
  oldNodeUrl?: string;
};

export type AugmentedNetworksContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
