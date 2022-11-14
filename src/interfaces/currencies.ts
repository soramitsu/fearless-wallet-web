import type { WalletAddress, AccountBalance, NetworkAssetsType } from '@/interfaces';
import type CurrencyController from '@/controllers/currencyController';
import type { FPNumber } from '@/util/fp';

type TypeAsset = NetworkAssetsType | 'native';

interface AvailableInNetworks {
  network: string;
  precision: number;
  existentialDeposit?: string;
  type: TypeAsset;
}

interface BalanceFP {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
}

type AvailableInNetworksFP = AvailableInNetworks & {
  balance: Record<WalletAddress, BalanceFP>;
};

type AvailableInNetworksForWalletFP = AvailableInNetworks & {
  balance: BalanceFP;
};

type AvailableInNetworksString = AvailableInNetworks & {
  balance: AccountBalance;
};

type Balances = AvailableInNetworksFP[];

type Currency = CurrencyController;

type Currencies = Currency[];

export {
  AvailableInNetworksFP,
  AvailableInNetworksForWalletFP,
  AvailableInNetworksString,
  Balances,
  Currencies,
  BalanceFP,
  Currency,
  TypeAsset,
};
