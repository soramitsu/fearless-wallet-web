import type { WalletAddress } from '@/interfaces/common';

type Node = {
  url: string;
  name: string;
};

type ActiveNodes = Record<WalletAddress, Node>;

export { Node, ActiveNodes };
