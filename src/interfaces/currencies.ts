import type { CodecString, Asset, DexId } from '@/types/sora';

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

type CreateSwapResult = {
  amountA: string;
  amountB: string;
  minMaxValue: string;
  AToB: string;
  BToA: string;
  route: string;
};

export { SwapOptions, CreateSwapResult, MarketType };
