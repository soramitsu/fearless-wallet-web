import { FPNumber } from '@sora-substrate/util';
import { AccountAsset, Asset } from '@sora-substrate/util/build/assets/types';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { SwapOptions } from '@/interfaces';

export interface BaseExchangeProps {
  amountDexIdXORFP: FPNumber;
  amountDexIdXSTUSDFP: FPNumber;
  assetA: Asset | AccountAsset;
  assetB: Asset | AccountAsset;
  slippage?: number;
  swapOptions: SwapOptions;
}

export interface CreateExchangeBOptions extends BaseExchangeProps {
  amountB?: string;
  providerFeeDexIdXSTUSD: string | number;
}

export interface CreateExchangeAOptions extends BaseExchangeProps {
  amountA: string;
  providerFeeDexIdXOR: string | number;
}
export interface ExtrinsicSwapOptions {
  amountA: string;
  amountB: string;
  swapOptions: SwapOptions;
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
}

export type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  providerFee: string;
  AToB: string;
  BToA: string;
  extrinsicOptions: ExtrinsicSwapOptions;
};
