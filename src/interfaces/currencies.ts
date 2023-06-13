import { CodecString } from '@sora-substrate/util';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import type { NetworkAssetsType } from '@/interfaces';
import type { Asset } from '@sora-substrate/util/build/assets/types';

type TypeAsset = NetworkAssetsType | 'native';

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
  providerFee: string;
  AToB: string;
  BToA: string;
  route: string;
};

export { TypeAsset, SwapOptions, CreateSwapResult, MarketType };
