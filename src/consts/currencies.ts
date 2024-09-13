import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { MarketType } from '@/interfaces';

const LIQUID_SOURCE_FOR_MARKET = {
  [MarketType.SMART]: LiquiditySourceTypes.Default,
  [MarketType.TBC]: LiquiditySourceTypes.MulticollateralBondingCurvePool,
};

const SUBSTRATE_EVM_UTILITY_ASSETS: Record<string, string> = {
  moonriver: 'movr',
  moonbeam: 'glmr',
};

export { LIQUID_SOURCE_FOR_MARKET, SUBSTRATE_EVM_UTILITY_ASSETS };
