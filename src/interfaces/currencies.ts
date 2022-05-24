import type { AccountBalance } from '@/interfaces/balances';

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export interface Currency {
  mainNetwork: string;
  token: string;
  price: number;
  grown: number;
  grownPercent: number;
  availableInNetworks: AvailableInNetworks[];
}

type WalletAddress = string;

export type Currencies = Record<WalletAddress, Currency[]>;

export interface HistoryItem {
  id: string;
  type: string;
  value: number;
  token: string;
  time: number;
}
