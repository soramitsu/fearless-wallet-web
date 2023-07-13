import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { MarketType } from '@/interfaces';

const LIQUID_SOURCE_FOR_MARKET = {
  [MarketType.SMART]: LiquiditySourceTypes.Default,
  [MarketType.TBC]: LiquiditySourceTypes.MulticollateralBondingCurvePool,
};

const ETHEREUM_UTILITY_ASSETS: Record<string, string> = {
  moonriver: 'movr',
  moonbeam: 'glmr',
};

export { LIQUID_SOURCE_FOR_MARKET, ETHEREUM_UTILITY_ASSETS };
