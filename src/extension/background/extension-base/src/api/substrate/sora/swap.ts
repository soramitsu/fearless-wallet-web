import { getAssetOptions } from '@extension-base/api/substrate';
import { getSoraAsset } from '.';
import type State from '@extension-base/background/handlers/State';
import type { CreateSwapResult, BaseExchangeProps } from '@extension-base/api/types/swaps';
import type { SwapOptions } from '@/interfaces';
import { DexId } from '@/sora/types';
import { type Api, FPNumber } from '@/sora';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';
import { SORA_NETWORK_NAME } from '@/consts/sora';

async function createExchangeB(
  props: BaseExchangeProps,
  api: Api<void>
): Promise<Omit<CreateSwapResult, 'swapOptions'>> {
  const { expectedAmount, route, assetA, assetB, amountB, slippage } = props;
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, expectedAmount.toString(), amountB!, true, slippage!);

  return {
    amountA: expectedAmount.toString(),
    amountB: amountB!,
    AToB: expectedAmount.div(new FPNumber(amountB!)).toString(),
    BToA: new FPNumber(amountB!).div(expectedAmount).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue, assetA.decimals).toString(),
    route,
  };
}

async function createExchangeA(
  props: BaseExchangeProps,
  api: Api<void>
): Promise<Omit<CreateSwapResult, 'swapOptions'>> {
  const { expectedAmount, route, assetA, assetB, amountA, slippage } = props;
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, amountA!, expectedAmount.toString(), false, slippage!);

  return {
    amountA,
    amountB: expectedAmount.toString(),
    AToB: new FPNumber(amountA!).div(expectedAmount).toString(),
    BToA: expectedAmount.div(new FPNumber(amountA!)).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue, assetB.decimals).toString(),
    route,
  };
}

/**
 * Create swap extrinsic
 * @param {Partial<SwapOptions>} options
 * @returns {Promise<CreateSwapResult>}
 */
export async function createSwap(
  options: Partial<SwapOptions>,
  api: Api<void>,
  state: State
): Promise<CreateSwapResult> {
  const { assetAId, assetBId, isExchangeB, amountA, amountB, slippage, marketType } = options;
  const currentAccount = state.currentAccount;

  const tokenBalanceA = state.balanceService
    .getAccountBalance(currentAccount!.address)
    .find(({ groupId }) => groupId === assetAId);

  const tokenBalanceB = state.balanceService
    .getAccountBalance(currentAccount!.address)
    .find(({ groupId }) => groupId === assetBId);

  const aId = tokenBalanceA?.balances.find(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);
  const aIB = tokenBalanceB?.balances.find(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

  const assetAAddress = getAssetOptions(aId!.id, state.networkService.assetsMap) as string;
  const assetBAddress = getAssetOptions(aIB!.id, state.networkService.assetsMap) as string;

  const amountWithDirection = (isExchangeB ? amountB : amountA) as string;
  const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];

  const assetA = getSoraAsset({ assetId: assetAId!, tokenBalance: tokenBalanceA!, network: SORA_NETWORK_NAME });
  const assetB = getSoraAsset({ assetId: assetBId!, tokenBalance: tokenBalanceB!, network: SORA_NETWORK_NAME });

  const { amount: amountDexIdXOR, route: routeDexIdXOR } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    DexId.XOR
  );

  const { amount: amountDexIdXSTUSD, route: routeDexIdXSTUSD } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    DexId.XSTUSD
  );

  const quoteDecimals = isExchangeB ? assetA.decimals : assetB.decimals;
  const amountDexIdXORFP = FPNumber.fromCodecValue(amountDexIdXOR, quoteDecimals);
  const amountDexIdXSTUSDFP = FPNumber.fromCodecValue(amountDexIdXSTUSD, quoteDecimals);

  let isDexXor;
  let expectedAmount;
  let route;

  if (amountDexIdXORFP.isZero()) {
    isDexXor = false;
    expectedAmount = amountDexIdXSTUSDFP;
    route = routeDexIdXSTUSD;
  } else if (amountDexIdXSTUSDFP.isZero()) {
    isDexXor = true;
    expectedAmount = amountDexIdXORFP;
    route = routeDexIdXOR;
  } else {
    isDexXor = isExchangeB
      ? FPNumber.lt(amountDexIdXORFP, amountDexIdXSTUSDFP)
      : FPNumber.gt(amountDexIdXORFP, amountDexIdXSTUSDFP);
    expectedAmount = isDexXor ? amountDexIdXORFP : amountDexIdXSTUSDFP;
    route = isDexXor ? routeDexIdXOR : routeDexIdXSTUSD;
  }

  route =
    route
      ?.map((item) => {
        const { symbol } = state.networkService.assetsMap.find(({ currencyId }) => currencyId === item)!;

        return symbol.toUpperCase();
      })
      .join(' > ') ?? '';

  const swapOptions = {
    ...options,
    assetA,
    assetB,
    swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
  } as SwapOptions;

  const baseOptions: BaseExchangeProps = {
    expectedAmount,
    isDexXor,
    route,
    assetA,
    assetB,
    slippage,
    amountA: amountA ?? '0',
    amountB: amountB ?? '0',
  };

  const swapResult = isExchangeB ? await createExchangeB(baseOptions, api) : await createExchangeA(baseOptions, api);

  return {
    ...swapResult,
    swapOptions: {
      ...swapOptions,
      amountA: swapResult.amountA,
      amountB: swapResult.amountB,
    },
  };
}

/** Refresh availability without replacing the amounts the user confirmed. */
export async function prepareSwapExecution(
  options: Pick<SwapOptions, 'amountA' | 'amountB' | 'isExchangeB' | 'slippage'> & Partial<SwapOptions>,
  api: Api<void>,
  state: State
): Promise<{ swapOptions: SwapOptions; maximumSourceAmount: string }> {
  const approved = { ...options };
  const quote = await createSwap(approved, api, state);
  const { assetA, assetB } = quote.swapOptions!;
  const input = new FPNumber(approved.amountA, assetA.decimals);
  const output = new FPNumber(approved.amountB, assetB.decimals);
  if (!input.isFinity() || !input.gt(0) || !output.isFinity() || !output.gt(0)) {
    throw new Error('Refresh the SORA quote before confirming');
  }

  const limit = FPNumber.fromCodecValue(
    api.swap.getMinMaxValue(assetA, assetB, approved.amountA, approved.amountB, approved.isExchangeB, approved.slippage),
    approved.isExchangeB ? assetA.decimals : assetB.decimals
  );
  const refreshed = new FPNumber(approved.isExchangeB ? quote.amountA : quote.amountB);
  if (!limit.isFinity() || !limit.gt(0) || !refreshed.isFinity() || !refreshed.gt(0)) {
    throw new Error('Refresh the SORA quote before confirming');
  }
  if (approved.isExchangeB ? refreshed.gt(limit) : refreshed.lt(limit)) {
    throw new Error('The SORA quote moved beyond your confirmed slippage');
  }

  return {
    swapOptions: { ...quote.swapOptions!, amountA: input.toString(), amountB: output.toString() },
    // Fixed-output swaps may spend up to the approved cap; reserve fees on top.
    maximumSourceAmount: approved.isExchangeB ? limit.toString() : input.toString(),
  };
}
