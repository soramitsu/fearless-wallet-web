import { FPNumber } from '@sora-substrate/util';
import { AccountAsset, Asset } from '@sora-substrate/util/build/assets/types';
import { SwapOptions } from '@/interfaces';

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
  swapOptions?: SwapOptions;
}

export type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  providerFee: string;
  AToB: string;
  BToA: string;
  route: string;
  swapOptions?: SwapOptions;
};
