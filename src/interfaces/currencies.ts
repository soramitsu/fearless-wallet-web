import { FPNumber, CodecString } from '@sora-substrate/util';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import type { WalletAddress, NetworkAssetsType, NetworkName, AccountBalance } from '@/interfaces';
import type { CurrencyController } from '@/controllers';
import type { ApiPromise } from '@polkadot/api';
import type { SignerOptions } from '@polkadot/api/submittable/types';
import type { Asset } from '@sora-substrate/util/build/assets/types';

type TypeAsset = NetworkAssetsType | 'native';

interface AssetBalance {
  network: string;
  precision: number;
  existentialDeposit?: string;
  type: TypeAsset;
  assetId: string;
}

interface BalanceFP {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
  muchTotal?: FPNumber; // only for XOR
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

enum MarketType {
  SMART = 'SMART',
  TBC = 'TBC',
}

type SwapOptions = {
  isExchangeB: boolean;
  marketType: MarketType;
  network: string;
  slippage: number;
  swapDexId: DexId;
  assetAId: string;
  assetBId: string;
  amountA: string | CodecString;
  amountB: string | CodecString;
  precisionAssetA: number;
  precisionAssetB: number;
  symbolA: string;
  symbolB: string;
  assetA: Asset;
  assetB: Asset;
};

type ExtrinsicOptions = {
  transactionsOptions?: Partial<SignerOptions>;
  historyOptions?: { networkProps: WalletBalance; amount: string; to: string };
  api?: ApiPromise;
  swapOptions?: SwapOptions;
  fee?: string;
};

type UpdateBalanceProps = {
  walletAddress: WalletAddress;
  network: NetworkName;
  balance: AccountBalance;
};

type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  providerFee: string;
  AToB: string;
  BToA: string;
  route: string;
};

export {
  WalletBalance,
  Balances,
  Currencies,
  BalanceFP,
  Currency,
  TypeAsset,
  SwapOptions,
  ExtrinsicOptions,
  UpdateBalanceProps,
  CreateSwapResult,
  MarketType,
};
