import type { WalletAddress, NetworkName, AssetId, AssetName } from '@/interfaces';

type Reward = {
  amount: string;
  era: number;
  eventIdx: number;
  isReward: boolean;
  stash: string;
  validator: string;
};

type Transfer = {
  amount: string;
  eventIdx?: number;
  fee: string;
  from: string;
  success: boolean;
  hash: string;
  to: string;
};

type HistoryExtrinsic = {
  call: string;
  fee: string;
  hash: string;
  module: string;
  success: boolean;
};

type HistoryElement = {
  id: string;
  address: string;
  timestamp: string;
  extrinsic?: HistoryExtrinsic;
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
  module: 'staking' | 'liquidityProxy' | 'demeterFarmingPlatform' | 'utility' | string;
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
  nodes: HistoryElement[]; // | SoraHistoryElement[]
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForWalletAddress = Record<NetworkName, SubqueryHistory>;

type HistoryForAssetId = Record<WalletAddress, HistoryForWalletAddress>;

type History = Record<AssetId, HistoryForAssetId>;

type GetHistory = (assetName: AssetName, networkName: NetworkName, address?: string) => SubqueryHistory;

enum TransactionType {
  transfer = 'transfer',
  reward = 'reward',
  extrinsic = 'extrinsic',
  sora = 'sora',
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
export {
  TransactionType,
  GetHistory,
  History,
  HistoryForWalletAddress,
  HistoryExtrinsic,
  SubqueryHistory,
  GiantsquidHistoryItem,
  Reward,
  HistoryElement,
  Transfer,
  SoraHistoryElement,
  X1HistoryElement,
  ZetaHistoryItem,
  ZetaHistory,
};
