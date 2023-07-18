import type { WalletAddress, NetworkName, AssetName } from '@/interfaces';

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
  to: string;
};

type Extrinsic = {
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
  extrinsic?: Extrinsic;
  reward?: Reward;
  transfer?: Transfer;
  isMock?: true;
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
  nodes: HistoryElement[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForWalletAddress = Record<NetworkName, SubqueryHistory>;

type HistoryForAssetId = Record<WalletAddress, HistoryForWalletAddress>;

type History = Record<AssetName, HistoryForAssetId>;

type GetHistory = (assetId: AssetName, walletAddress: WalletAddress, networkName: NetworkName) => SubqueryHistory;

enum TransferType {
  incoming = 'Incoming',
  outgoing = 'Outgoing',
}

enum TransactionType {
  transfer = 'transfer',
  reward = 'reward',
  extrinsic = 'extrinsic',
}

export {
  TransactionType,
  TransferType,
  GetHistory,
  History,
  HistoryForWalletAddress,
  Extrinsic,
  SubqueryHistory,
  GiantsquidHistoryItem,
  Reward,
  HistoryElement,
  Transfer,
};
