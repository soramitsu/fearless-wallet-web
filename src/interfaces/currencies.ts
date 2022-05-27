import type { AccountBalance } from '@/interfaces/balances';
import CurrencyController from '@/controllers/currencyController';

type WalletAddress = string;

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export type Currency = CurrencyController;

export type Currencies = Record<WalletAddress, Currency[]>;

export type MockCurrencies = {
  substrate: Currency[];
  ethereum: Currency[];
};

export interface HistoryItem {
  id: string;
  type: string;
  value: number;
  token: string;
  time: number;
}
