import { Api, FPNumber } from '@sora-substrate/util';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { state } from '@extension-base/background/handlers';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import type { Asset } from '@sora-substrate/util/build/assets/types';
import type { ExtrinsicSwapOptions, CreateSwapResult, BaseExchangeProps } from '@extension-base/api/types/swaps';
import type { SwapOptions } from '@/interfaces';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';

async function createExchangeB(props: BaseExchangeProps, api: Api<void>): Promise<CreateSwapResult> {
  const { expectedAmount, isDexXor, providerFee, route, assetA, assetB, amountB, slippage, swapOptions } = props;
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, expectedAmount.toString(), amountB!, true, slippage!);
  const extrinsicOptions: ExtrinsicSwapOptions = {
    ...swapOptions,
    amountA: expectedAmount.toString(),
    amountB: amountB!,
    swapOptions,
    swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
  };

  return {
    amountA: expectedAmount.toString(),
    amountB: amountB!,
    AToB: expectedAmount.div(new FPNumber(amountB!)).toString(),
    BToA: new FPNumber(amountB!).div(expectedAmount).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
    providerFee: FPNumber.fromCodecValue(providerFee).toString(),
    extrinsicOptions,
    route,
  };
}

async function createExchangeA(props: BaseExchangeProps, api: Api<void>): Promise<CreateSwapResult> {
  const { expectedAmount, isDexXor, providerFee, route, assetA, assetB, amountA, slippage, swapOptions } = props;
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, amountA!, expectedAmount.toString(), false, slippage!);
  const extrinsicOptions: ExtrinsicSwapOptions = {
    ...swapOptions,
    swapOptions,
    amountA: amountA!,
    amountB: expectedAmount.toString(),
    swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
  };

  return {
    amountA,
    amountB: expectedAmount.toString(),
    AToB: new FPNumber(amountA!).div(expectedAmount).toString(),
    BToA: expectedAmount.div(new FPNumber(amountA!)).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
    providerFee: FPNumber.fromCodecValue(providerFee).toString(),
    extrinsicOptions,
    route,
  };
}

/**
 * Create swap extrinsic
 * @param {Partial<SwapOptions>} options
 * @returns {Promise<CreateSwapResult>}
 */
export async function createSwap(options: Partial<SwapOptions>, api: Api<void>): Promise<CreateSwapResult> {
  const { assetAId, assetBId, isExchangeB, amountA, amountB, symbolA, symbolB, slippage, marketType } = options;
  const assetAAddress = getAssetOptions(assetAId!) as string;
  const assetBAddress = getAssetOptions(assetBId!) as string;
  const amountWithDirection = (isExchangeB ? amountB : amountA) as string;
  const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];
  const assetA: Asset = { address: assetAAddress, decimals: 18, name: symbolA!, symbol: symbolA! };
  const assetB: Asset = {
    address: assetBAddress,
    decimals: 18,
    name: symbolB!,
    symbol: symbolB!,
  };

  const {
    amount: amountDexIdXOR,
    fee: providerFeeDexIdXOR,
    route: routeDexIdXOR,
  } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    DexId.XOR
  );

  const {
    amount: amountDexIdXSTUSD,
    fee: providerFeeDexIdXSTUSD,
    route: routeDexIdXSTUSD,
  } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    DexId.XSTUSD
  );

  const swapOptions = { ...options, assetA, assetB } as SwapOptions;
  const amountDexIdXORFP = FPNumber.fromCodecValue(amountDexIdXOR);
  const amountDexIdXSTUSDFP = FPNumber.fromCodecValue(amountDexIdXSTUSD);

  let isDexXor;
  let expectedAmount;
  let providerFee;
  let route;

  if (amountDexIdXORFP.isZero()) {
    isDexXor = false;
    expectedAmount = amountDexIdXSTUSDFP;
    providerFee = providerFeeDexIdXSTUSD;
    route = routeDexIdXSTUSD;
  } else if (amountDexIdXSTUSDFP.isZero()) {
    isDexXor = true;
    expectedAmount = amountDexIdXORFP;
    providerFee = providerFeeDexIdXOR;
    route = routeDexIdXOR;
  } else {
    isDexXor = isExchangeB
      ? FPNumber.lt(amountDexIdXORFP, amountDexIdXSTUSDFP)
      : FPNumber.gt(amountDexIdXORFP, amountDexIdXSTUSDFP);
    expectedAmount = isDexXor ? amountDexIdXORFP : amountDexIdXSTUSDFP;
    providerFee = isDexXor ? providerFeeDexIdXOR : providerFeeDexIdXSTUSD;
    route = isDexXor ? routeDexIdXOR : routeDexIdXSTUSD;
  }

  route =
    route
      ?.map((item) => {
        const { symbol } = state.assetsMap.find(({ currencyId }) => currencyId === item)!;

        return symbol.toUpperCase();
      })
      .join(' > ') ?? '';

  const baseOptions: BaseExchangeProps = {
    swapOptions,
    expectedAmount,
    providerFee,
    isDexXor,
    route,
    assetA,
    assetB,
    slippage,
    amountA: amountA ?? '0',
    amountB: amountB ?? '0',
  };

  return isExchangeB ? createExchangeB(baseOptions, api) : createExchangeA(baseOptions, api);
}
