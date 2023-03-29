import { Api, FPNumber } from '@sora-substrate/util';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { Asset } from '@sora-substrate/util/build/assets/types';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { getAssetOptions } from './utils';
import { SwapOptions, CreateSwapResult } from '@/interfaces';

/**
 * Create swap extrinsic
 * @param {Partial<SwapOptions>} options
 * @returns {Promise<CreateSwapResult>}
 */
export async function createSwap(options: Partial<SwapOptions>, api: Api<void>): Promise<CreateSwapResult> {
  const { assetAId, assetBId, isExchangeB, amountA, amountB, symbolA, symbolB, slippage } = options;
  const assetAAddress = getAssetOptions('', 'soraAsset', assetAId!) as string;
  const assetBAddress = getAssetOptions('', 'soraAsset', assetBId!) as string;
  const amountWithDirection = (isExchangeB ? amountB : amountA) as string;
  const assetA: Asset = { address: assetAAddress, decimals: 18, name: symbolA!, symbol: symbolA! };
  const assetB: Asset = {
    address: assetBAddress,
    decimals: 18,
    name: symbolB!,
    symbol: symbolB!,
  };

  const { amount: amountDexIdXOR, fee: providerFeeDexIdXOR } = await api.swap.getResultFromBackend(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    LiquiditySourceTypes.Default,
    DexId.XOR
  );

  const { amount: amountDexIdXSTUSD, fee: providerFeeDexIdXSTUSD } = await api.swap.getResultFromBackend(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    LiquiditySourceTypes.Default,
    DexId.XSTUSD
  );
  let extrinsicOptions;
  const swapOptions = { ...options, assetA, assetB } as SwapOptions;
  const amountDexIdXORFP = FPNumber.fromCodecValue(amountDexIdXOR);
  const amountDexIdXSTUSDFP = FPNumber.fromCodecValue(amountDexIdXSTUSD);

  if (isExchangeB) {
    const isDexXor = amountDexIdXORFP.isZero()
      ? false
      : amountDexIdXSTUSDFP.isZero()
      ? true
      : FPNumber.lt(amountDexIdXORFP, amountDexIdXSTUSDFP);

    const expectedAmountA = amountDexIdXORFP.isZero()
      ? amountDexIdXSTUSDFP
      : amountDexIdXSTUSDFP.isZero()
      ? amountDexIdXORFP
      : isDexXor
      ? amountDexIdXORFP
      : amountDexIdXSTUSDFP;

    const minMaxValue = api.swap.getMinMaxValue(
      assetA,
      assetB,
      expectedAmountA.toString(),
      amountB!,
      isExchangeB,
      slippage!
    );

    extrinsicOptions = {
      ...swapOptions,
      amountA: expectedAmountA.toString(),
      amountB: amountB!,
      swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
    };

    return {
      amountA: expectedAmountA.toString(),
      amountB: amountB!,
      AToB: expectedAmountA.div(new FPNumber(amountB!)).toString(),
      BToA: new FPNumber(amountB!).div(expectedAmountA).toString(),
      minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
      providerFee: FPNumber.fromCodecValue(providerFeeDexIdXSTUSD).toString(),
    };
  } else {
    const isDexXor = amountDexIdXORFP.isZero()
      ? false
      : amountDexIdXSTUSDFP.isZero()
      ? true
      : FPNumber.gt(amountDexIdXORFP, amountDexIdXSTUSDFP);

    const expectedAmountB = amountDexIdXORFP.isZero()
      ? amountDexIdXSTUSDFP
      : amountDexIdXSTUSDFP.isZero()
      ? amountDexIdXORFP
      : isDexXor
      ? amountDexIdXORFP
      : amountDexIdXSTUSDFP;

    const minMaxValue = api.swap.getMinMaxValue(
      assetA,
      assetB,
      amountA!,
      expectedAmountB.toString(),
      isExchangeB!,
      slippage!
    );

    extrinsicOptions = {
      ...swapOptions,
      amountA: amountA!,
      amountB: expectedAmountB.toString(),
      swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
    };

    return {
      amountA: amountA!,
      amountB: expectedAmountB.toString(),
      AToB: new FPNumber(amountA!).div(expectedAmountB).toString(),
      BToA: expectedAmountB.div(new FPNumber(amountA!)).toString(),
      minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
      providerFee: FPNumber.fromCodecValue(providerFeeDexIdXOR).toString(),
    };
  }
}
