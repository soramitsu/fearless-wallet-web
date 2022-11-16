import { FPNumber } from '@sora-substrate/math';
import type { WalletAddress, NetworkAssetsType } from '@/interfaces';
import type CurrencyController from '@/controllers/currencyController';

type TypeAsset = NetworkAssetsType | 'native';

interface AssetBalance {
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

type WalletBalance = AssetBalance & {
  balance: BalanceFP;
};

type AssetsBalances = AssetBalance & {
  balance: Record<WalletAddress, BalanceFP>;
};

type Balances = AssetsBalances[];

type Currency = CurrencyController;

type Currencies = Currency[];

export { WalletBalance, Balances, Currencies, BalanceFP, Currency, TypeAsset };
