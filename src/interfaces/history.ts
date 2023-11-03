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
  eventIdx: number;
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
    baseAssetId?: string;
    targetAssetId?: string;
    selectedMarket?: string;
    baseAssetAmount?: string;
    targetAssetAmount?: string;
    liquidityProviderFee?: string;
    maxAdditional?: string;
    value?: string;
    amount?: string;
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

interface SubqueryHistory {
  nodes: HistoryElement[]; // | SoraHistoryElement[]
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForWalletAddress = Record<NetworkName, SubqueryHistory>;

type HistoryForAssetId = Record<WalletAddress, HistoryForWalletAddress>;

type History = Record<AssetId, HistoryForAssetId>;

type GetHistory = (assetId: AssetName, networkName: NetworkName) => SubqueryHistory;

enum TransactionType {
  transfer = 'transfer',
  reward = 'reward',
  extrinsic = 'extrinsic',
}

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
};
