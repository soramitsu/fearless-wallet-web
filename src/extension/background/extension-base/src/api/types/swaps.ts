import { type FPNumber } from '@/sora/number';
import { type AccountAsset, type Asset } from '@/sora/types';
import { type SwapOptions } from '@/interfaces';

export interface BaseExchangeProps {
  expectedAmount: FPNumber;
  isDexXor: boolean;
  route: string;
  assetA: Asset | AccountAsset;
  assetB: Asset | AccountAsset;
  slippage?: number;
  amountA: string;
  amountB?: string;
  swapOptions?: SwapOptions;
}

export type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  AToB: string;
  BToA: string;
  route: string;
  swapOptions?: SwapOptions;
};
