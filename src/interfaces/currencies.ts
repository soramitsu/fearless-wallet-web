import type { WalletAddress } from '@/interfaces/common';
import type { AccountBalance } from '@/interfaces/balances';
import type CurrencyController from '@/controllers/currencyController';
import type { FPNumber } from '@/util/fp';
import type { NetworkAssetsType } from '@/interfaces/networks';

interface AvailableInNetworks {
  network: string;
  balance: AccountBalance;
}

interface BalanceFP {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
}

type AvailableInNetworksFP = Omit<AvailableInNetworks, 'balance'> & {
  balance: BalanceFP;
  type: NetworkAssetsType | 'native';
};

type Balances = Record<WalletAddress, AvailableInNetworksFP[]>;

type Currency = CurrencyController;

type Currencies = Currency[];

export { AvailableInNetworksFP, Balances, Currencies, AvailableInNetworks, BalanceFP, Currency };
