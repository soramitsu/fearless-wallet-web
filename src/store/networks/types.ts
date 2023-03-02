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
  NetworkName,
} from '@/interfaces';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { KeyringJson } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/networks/state';
import type { Mutations } from '@/store/networks/mutations';

// getters
export type GetNetwork = (networkName: NetworkName) => Network;

export type GetNetworkGenesisHash = (networkName: NetworkName) => HexString;

export type GetAssetName = (assetId: string) => string;
export type GetAssetIcon = (assetId: string) => string;

export type GetAssetPrice = (assetId: string) => AssetPrice;

export type GetNetworkStatus = (networkName: NetworkName) => NetworkStatus;

export type GetActiveNodesByNetwork = (networkName: NetworkName) => Node;

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

export type SetAssetsPriceIntervalProps = {
  interval: NodeJS.Timer;
};

export type SetCurrenciesProps = {
  currencies: Currencies | Record<NetworkName, Currencies>;
  address?: string;
  network?: NetworkName;
};

export type SetHistoryProps = {
  history: HistoryItem;
  walletAddress: string;
  networkName: NetworkName;
  isPreviously: boolean;
  assetId: string;
  isMock?: true;
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
export type LoadJsons = {
  chainsUrl: string;
  assetsUrl: string;
  fiatsUrl: string;
};

export type LoadHistory = {
  networkName: NetworkName;
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
  network: NetworkName;
  nodeName?: string;
  nodeUrl?: string;
  oldNodeUrl?: string;
};

export type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;
