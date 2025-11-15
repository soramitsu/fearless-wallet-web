import { getAssetOptions } from '@extension-base/api/substrate';
import { getFPNumberCtor } from '@extension-base/services/utils/sora';
import { getSoraAsset } from '.';
import type { Api } from '@sora/api';
import type { LiquiditySourceTypes } from '@sora/liquidityProxy/consts';
import type State from '@extension-base/background/handlers/State';
import type { CreateSwapResult, BaseExchangeProps } from '@extension-base/api/types/swaps';
import type { SwapOptions } from '@/interfaces';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { findTokenBalanceByNetwork } from '@/helpers';

const getFPNumber = getFPNumberCtor;
const SORA_DEX_ID = {
  XOR: 0,
  XSTUSD: 1,
} as const;

async function createExchangeB(
  props: BaseExchangeProps,
  api: Api<void>
): Promise<Omit<CreateSwapResult, 'swapOptions'>> {
  const { expectedAmount, route, assetA, assetB, amountB, slippage } = props;
  const FPNumber = await getFPNumber();
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, expectedAmount.toString(), amountB!, true, slippage!);

  return {
    amountA: expectedAmount.toString(),
    amountB: amountB!,
    AToB: expectedAmount.div(new FPNumber(amountB!)).toString(),
    BToA: new FPNumber(amountB!).div(expectedAmount).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
    route,
  };
}

async function createExchangeA(
  props: BaseExchangeProps,
  api: Api<void>
): Promise<Omit<CreateSwapResult, 'swapOptions'>> {
  const { expectedAmount, route, assetA, assetB, amountA, slippage } = props;
  const FPNumber = await getFPNumber();
  const minMaxValue = api.swap.getMinMaxValue(assetA, assetB, amountA!, expectedAmount.toString(), false, slippage!);

  return {
    amountA,
    amountB: expectedAmount.toString(),
    AToB: new FPNumber(amountA!).div(expectedAmount).toString(),
    BToA: expectedAmount.div(new FPNumber(amountA!)).toString(),
    minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
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
  const FPNumber = await getFPNumber();
  const { assetAId, assetBId, isExchangeB, amountA, amountB, slippage, marketType } = options;
  const currentAccount = state.currentAccount;

  const accountBalances = state.balanceService.getAccountBalance(currentAccount!.address);

  const tokenBalanceA = accountBalances.find(({ groupId }) => groupId === assetAId);
  const tokenBalanceB = accountBalances.find(({ groupId }) => groupId === assetBId);

  if (!tokenBalanceA || !tokenBalanceB) {
    throw new Error('Missing token balances for swap operation');
  }

  const balanceA = findTokenBalanceByNetwork(tokenBalanceA, SORA_NETWORK_NAME);
  const balanceB = findTokenBalanceByNetwork(tokenBalanceB, SORA_NETWORK_NAME);

  if (!balanceA || !balanceB) {
    throw new Error('Unable to resolve Sora balance for swap operation');
  }

  const assetAAddress = getAssetOptions(balanceA.id, state.networkService.assetsMap) as string;
  const assetBAddress = getAssetOptions(balanceB.id, state.networkService.assetsMap) as string;

  const amountWithDirection = (isExchangeB ? amountB : amountA) as string;
  const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!] as LiquiditySourceTypes;

  const assetA = getSoraAsset({ assetId: assetAId!, tokenBalance: tokenBalanceA!, network: SORA_NETWORK_NAME });
  const assetB = getSoraAsset({ assetId: assetBId!, tokenBalance: tokenBalanceB!, network: SORA_NETWORK_NAME });

  const { amount: amountDexIdXOR, route: routeDexIdXOR } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    SORA_DEX_ID.XOR
  );

  const { amount: amountDexIdXSTUSD, route: routeDexIdXSTUSD } = await api.swap.getResultFromDexRpc(
    assetAAddress,
    assetBAddress,
    amountWithDirection,
    isExchangeB,
    liquiditySource,
    true,
    SORA_DEX_ID.XSTUSD
  );

  const amountDexIdXORFP = FPNumber.fromCodecValue(amountDexIdXOR);
  const amountDexIdXSTUSDFP = FPNumber.fromCodecValue(amountDexIdXSTUSD);

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
    swapDexId: isDexXor ? SORA_DEX_ID.XOR : SORA_DEX_ID.XSTUSD,
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
