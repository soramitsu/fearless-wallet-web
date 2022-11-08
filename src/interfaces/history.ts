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

type HistoryNode = {
  id: string;
  address: string;
  timestamp: string;
  extrinsic?: Extrinsic;
  reward?: Reward;
  transfer?: Transfer;
  isMock?: true;
};

interface HistoryItem {
  nodes: HistoryNode[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForWalletAddress = Record<NetworkName, HistoryItem>;

type HistoryForAssetId = Record<WalletAddress, HistoryForWalletAddress>;

type History = Record<AssetName, HistoryForAssetId>;

type GetHistory = (assetId: AssetName, walletAddress: WalletAddress, networkName: NetworkName) => HistoryItem;

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
  HistoryItem,
  Reward,
  HistoryNode,
  Transfer,
};
