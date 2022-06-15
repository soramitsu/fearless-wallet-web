import type { AccountBalance } from '@/interfaces/balances';
import CurrencyController from '@/controllers/currencyController';
import { WalletAddress } from '@/interfaces/common';

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export type Currency = CurrencyController;

export type Currencies = Record<WalletAddress, Currency[]>;
