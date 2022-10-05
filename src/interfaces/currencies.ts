import type { WalletAddress, AccountBalance, NetworkAssetsType } from '@/interfaces';
import type CurrencyController from '@/controllers/currencyController';
import type { FPNumber } from '@/util/fp';

type TypeAsset = NetworkAssetsType | 'native';

interface AvailableInNetworks {
  network: string;
  precision: number;
  type: TypeAsset;
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
};

type Balances = Record<WalletAddress, AvailableInNetworksFP[]>;

type Currency = CurrencyController;

type Currencies = Currency[];

export { AvailableInNetworksFP, Balances, Currencies, AvailableInNetworks, BalanceFP, Currency, TypeAsset };
