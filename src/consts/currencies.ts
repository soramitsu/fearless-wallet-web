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

const TON_ID = '2ba4723a-74b4-4a6f-a888-e51937773807-239';

export { TON_ID, LIQUID_SOURCE_FOR_MARKET, SUBSTRATE_EVM_UTILITY_ASSETS };
