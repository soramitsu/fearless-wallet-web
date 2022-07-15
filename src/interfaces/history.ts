import { WalletAddress, NetworkName } from '@/interfaces/common';

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

export type HistoryNode = {
  id: string;
  address: string;
  timestamp: string;
  extrinsic: Extrinsic;
  reward: Reward;
  transfer: Transfer;
};

export interface HistoryItem {
  nodes: HistoryNode[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
  };
}

export type HistoryForNetwork = Record<WalletAddress, HistoryItem>;

export type History = Record<NetworkName, HistoryForNetwork>;
