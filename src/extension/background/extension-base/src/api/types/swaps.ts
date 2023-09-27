import { FPNumber } from '@sora-substrate/util';
import { AccountAsset, Asset } from '@sora-substrate/util/build/assets/types';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { MarketType, SwapOptions } from '@/interfaces';

export interface BaseExchangeProps {
  expectedAmount: FPNumber;
  providerFee: string;
  isDexXor: boolean;
  route: string;
  assetA: Asset | AccountAsset;
  assetB: Asset | AccountAsset;
  slippage?: number;
  amountA: string;
  amountB?: string;
}

export interface ExtrinsicSwapOptions {
  amountA: string;
  amountB: string;
  swapOptions?: SwapOptions;
  swapDexId: DexId;
  isExchangeB: boolean;
  network: string;
  slippage: number;
  assetAId: string;
  assetBId: string;
  precisionAssetA: number;
  precisionAssetB: number;
  symbolA: string;
  symbolB: string;
  assetA: Asset;
  assetB: Asset;
  marketType: MarketType;
}

export type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  providerFee: string;
  AToB: string;
  BToA: string;
  route: string;
  swapOptions: SwapOptions;
};
