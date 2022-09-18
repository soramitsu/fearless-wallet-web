import type { WalletAddress, NetworkName } from '@/interfaces/common';

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
  extrinsic: Extrinsic;
  reward: Reward;
  transfer: Transfer;
};

interface HistoryItem {
  nodes: HistoryNode[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

type HistoryForNetwork = Record<WalletAddress, HistoryItem>;

type History = Record<NetworkName, HistoryForNetwork>;

type GetHistory = (networkName: string) => HistoryForNetwork;

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
  HistoryForNetwork,
  Extrinsic,
  HistoryItem,
  Reward,
  HistoryNode,
  Transfer,
};
