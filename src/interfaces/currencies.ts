import type { WalletAddress } from '@/interfaces/common';
import type { AccountBalance } from '@/interfaces/balances';
import type CurrencyController from '@/controllers/currencyController';
import type { FPNumber } from '@/util/fp';

export interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

export interface BalanceFP {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
}

export type AvailableInNetworksFP = Omit<AvailableInNetworks, 'balance'> & { balance: BalanceFP };

export type Balances = Record<WalletAddress, AvailableInNetworksFP[]>;

export type Currency = CurrencyController;

export type Currencies = Currency[];
