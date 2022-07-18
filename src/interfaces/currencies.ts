import type { WalletAddress } from '@/interfaces/common';
import type { AccountBalance } from '@/interfaces/balances';
import type CurrencyController from '@/controllers/currencyController';

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export type CurrencyFields = {
  mainNetwork: string;
  token: string;
  price: number;
  usd24HoursChange: number;
  precision: number;
  availableInNetworks: AvailableInNetworks[];
};

export type Currency = CurrencyController;

export type Currencies = Record<WalletAddress, Currency[]>;
