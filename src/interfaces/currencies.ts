import type { AccountBalance } from '@/interfaces/balances';

type WalletAddress = string;

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export interface Currency {
  mainNetwork: string;
  token: string;
  price: number;
  usd24HoursChange: number;
  availableInNetworks: AvailableInNetworks[];
}

export type Currencies = Record<WalletAddress, Currency[]>;

export interface HistoryItem {
  id: string;
  type: string;
  value: number;
  token: string;
  time: number;
}
