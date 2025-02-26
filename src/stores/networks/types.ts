import type { NetworkJson } from '@extension-base/types';
import type { ApiPromise, WsProvider } from '@polkadot/api';
import type { HexString } from '@polkadot/util/types';
import type {
  SubqueryHistory,
  AccountBalance,
  AssetPrice,
  FiatJson,
  Node,
  NetworkName,
  HistoryServiceType,
  GiantsquidHistoryItem,
  HistoryElement,
  SoraHistoryElement,
  SoraFees,
  Network,
  TonEvent,
} from '@/interfaces';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { KeyringJson } from '@subwallet/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';

// getters
export type GetNetwork = (networkName: string) => NetworkJson;
export type GetNetworkGenesisHash = (networkName: NetworkName) => HexString;
export type GetAssetIcon = (assetId: string) => string;
export type GetAssetPrice = (priceId: string) => AssetPrice;
export type GetActiveNodesByNetwork = (networkName: NetworkName) => Node;

export type SetNetworksStatusProps = {
  networks: NetworkJson[];
};

export type NetworkFavoriteProps = {
  networkName: string;
  address: string;
};

export type RemoveNetworkFavoriteProps = {
  networkName: string;
  index: number;
};

export type SetFiatsJsonProps = {
  fiats: FiatJson[];
};

export type SetAssetsPriceIntervalProps = {
  interval: NodeJS.Timer;
};

export type History = SubqueryHistory | GiantsquidHistoryItem[] | HistoryElement[] | SoraHistoryElement[] | TonEvent[];

export type HistoryProps = {
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

export type SetSoraFee = {
  fees: SoraFees;
};

// Actions
export type FetchHistory = {
  networkName: NetworkName;
  assetId: string;
  address?: string;
};

export type FetchTonHistory = {
  address: string;
  networkName: NetworkName;
};

export type ToggleFavorite = {
  networkName: NetworkName;
  address: string;
};

export type CustomAccounts = Record<string, { type?: KeypairType; json: KeyringJson }>;

export type SubscribeToBalances = {
  accounts: CustomAccounts | SubjectInfo;
  networksProps?: Network[];
};

export type ToggleActiveNode = {
  network: NetworkName;
  nodeName?: string;
  nodeUrl?: string;
  oldNodeUrl?: string;
};
