import type { WalletAddress } from '@/interfaces/common';
import type { AssetId, AssetName } from '@/interfaces/assets';
import type { NetworkName, NormalizedNetworkName, HistoryServiceType } from '@/interfaces/networks';

type BaseHistoryServiceType = Exclude<HistoryServiceType, `staking${string}`>;

type Reward = {
  amount: string;
  era: number;
  stash: string;
  validator: string;
};

type Transfer = {
  amount: string;
  fee: string;
  from: string;
  to: string;
};

type HistoryElement = {
  id: string;
  address: string;
  timestamp: string;
  success: boolean;
  name?: string;
  module?: string;
  method?: string;
  type?: 'rewarded' | 'bridge' | 'slashed';
  extrinsicIdx?: number;
  extrinsicHash?: string;
  entityType?: 'CALL' | 'EVENT';
  blockHeight?: number | string;
  blockHash?: string;
  reward?: Reward;
  transfer?: Transfer;
};

type SoraHistoryElement = {
  id: string;
  address: string;
  timestamp: string;
  blockHash: string;
  blockHeight: string;
  networkFee: string;
  execution: {
    success: boolean;
  };
  success: boolean; // дубликат execution.success для совместимости с HistoryElement
  module: 'staking' | 'liquidityProxy' | 'utility' | string;
  method:
    | 'setPayee'
    | 'unbond'
    | 'nominate'
    | 'bondExtra'
    | 'bond'
    | 'payoutStakers'
    | 'swap'
    | 'transfer'
    | 'rewarded'
    | 'batchAll'; // TODO
  data: {
    assetId?: string;
    baseAssetId?: string;
    targetAssetId?: string;
    selectedMarket?: string;
    baseAssetAmount?: string;
    targetAssetAmount?: string;
    liquidityProviderFee?: string;
    maxAdditional?: string;
    value?: string;
    amount?: string;
    to?: string;
    from?: string;
  };
};

interface GiantsquidHistoryItem {
  direction: 'To' | 'From';
  id: string;
  transfer: {
    id: string;
    amount: string;
    blockNumber: number;
    extrinsicHash: string;
    timestamp: string;
    success: boolean;
    from: {
      id: string;
    };
    to: {
      id: string;
    };
  };
}

type X1HistoryTxList = {
  txId: string;
  methodId: string;
  blockHash: string;
  height: string;
  transactionTime: string;
  from: string;
  to: string;
  isFromContract: boolean;
  isToContract: boolean;
  amount: string;
  transactionSymbol: string;
  txFee: string;
  state: string;
  tokenId: string;
  tokenContractAddress: string;
  challengeStatus: string;
  l1OriginHash: string;
};

type X1HistoryData = {
  page: string;
  limit: string;
  totalPage: string;
  chainFullName: string;
  chainShortName: string;
  transactionLists: X1HistoryTxList[];
};

type X1HistoryElement = {
  code: string;
  msg: string;
  data: X1HistoryData[];
};

interface SubqueryHistory {
  timestamp: number;
  nodes: HistoryElement[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForWalletAddress = Record<NormalizedNetworkName, SubqueryHistory>;

type HistoryForAssetId = Record<WalletAddress, HistoryForWalletAddress>;

type History = Record<AssetId, HistoryForAssetId>;

export type GetHistory = (assetName: AssetName, networkName: NetworkName, address?: string) => SubqueryHistory;

enum TransactionType {
  transfer = 'transfer',
  reward = 'reward',
  sora = 'sora',
  ton = 'ton',
}

type ZetaHistoryItem = {
  timestamp: string;
  fee: {
    type: 'maximum | actual';
    value: string;
  };
  gas_limit: string;
  block: number;
  status: 'ok' | 'error';
  method: null | 'transferFrom';
  confirmations: number;
  type: number;
  exchange_rate: null | string;
  to: {
    ens_domain_name?: string;
    hash: string;
    implementation_name?: string;
    is_contract: boolean;
    is_verified: boolean;
    name?: string;
  };
  tx_burnt_fee: string;
  max_fee_per_gas: string;
  result: 'success' | 'error';
  hash: string;
  gas_price: string;
  priority_fee: string;
  base_fee_per_gas: string;
  from: {
    ens_domain_name?: string;
    hash: string;
    implementation_name?: string;
    is_contract: boolean;
    is_verified: boolean;
    name?: string;
  };
  token_transfers: null;
  tx_types: ('token_transfer' | 'contract_creation' | 'contract_call' | 'token_creation' | 'coin_transfer')[];
  gas_used: string;
  value: string;
  max_priority_fee_per_gas: string;
};

type ZetaHistory = {
  items: ZetaHistoryItem[];
};

interface TonEvent {
  amount?: string;
  from?: string;
  to?: string;
  comment?: string;
  eventId?: string;
  amountIn?: string;
  amountOut?: string;
  dex?: string;
  userWallet?: string;
  timestamp?: number;
  method: string;
  networkFee: string;
  symbol: string;
  symbolIn?: string;
  isOutEvent: boolean;
  success: boolean;
}

type TonEventTokens = Record<string, TonEvent[]>;

type HistoryPayload = SubqueryHistory | GiantsquidHistoryItem[] | HistoryElement[] | SoraHistoryElement[] | TonEvent[];

type TypedHistoryResult<Type extends BaseHistoryServiceType, Payload> = {
  serviceType: Type;
  history: Payload;
};

type TonHistoryResult = TypedHistoryResult<'ton', TonEvent[]>;
type SoraHistoryResult = TypedHistoryResult<'sora', SoraHistoryElement[]>;
type SubqueryHistoryResult = TypedHistoryResult<'subquery', SubqueryHistory>;
type SubsquidHistoryResult = TypedHistoryResult<'subsquid', HistoryElement[]>;
type GiantsquidHistoryResult = TypedHistoryResult<'giantsquid', GiantsquidHistoryItem[]>;
type EtherscanHistoryResult = TypedHistoryResult<'etherscan', HistoryElement[]>;
type OklinkHistoryResult = TypedHistoryResult<'oklink', HistoryElement[]>;
type ZetaHistoryResult = TypedHistoryResult<'zeta', HistoryElement[]>;

type HistoryFetchResult =
  | TonHistoryResult
  | SoraHistoryResult
  | SubqueryHistoryResult
  | SubsquidHistoryResult
  | GiantsquidHistoryResult
  | EtherscanHistoryResult
  | OklinkHistoryResult
  | ZetaHistoryResult;

type HistoryResultItem = {
  assetId: AssetId;
  serviceType: BaseHistoryServiceType;
  history: SubqueryHistory;
};

type HistoryFetchResponse = HistoryResultItem[];

interface HistoryFetchRequest {
  network: NetworkName;
  endpoint: {
    type: HistoryServiceType;
    url: string;
  };
  address: {
    raw: string;
    formatted: string;
  };
  asset: {
    id: string;
    isUtility: boolean;
    contractAddress?: string;
  };
}

const hasExecutionSuccess = (value: unknown): value is { execution: { success: boolean } } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { execution?: { success?: unknown } }).execution?.success === 'boolean';

const hasSoraHistoryShape = (value: unknown): value is SoraHistoryElement =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { module?: unknown }).module === 'string' &&
  typeof (value as { method?: unknown }).method === 'string' &&
  hasExecutionSuccess(value);

const isSoraHistoryElement = (value: unknown): value is SoraHistoryElement => hasSoraHistoryShape(value);

const isTonEvent = (value: unknown): value is TonEvent =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { method?: unknown }).method === 'string' &&
  typeof (value as { networkFee?: unknown }).networkFee === 'string' &&
  typeof (value as { isOutEvent?: unknown }).isOutEvent === 'boolean';

export {
  TransactionType,
  History,
  HistoryForWalletAddress,
  SubqueryHistory,
  GiantsquidHistoryItem,
  Reward,
  TonEventTokens,
  HistoryElement,
  Transfer,
  SoraHistoryElement,
  isSoraHistoryElement,
  isTonEvent,
  X1HistoryElement,
  ZetaHistoryItem,
  ZetaHistory,
  TonEvent,
  HistoryFetchRequest,
  HistoryFetchResult,
  HistoryFetchResponse,
  HistoryResultItem,
  HistoryPayload,
  BaseHistoryServiceType,
};
