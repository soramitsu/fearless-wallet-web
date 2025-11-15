import { LiquiditySourceTypes } from '@sora/liquidityProxy/consts';
import { MarketType } from '@/interfaces';

const SORA_LIQUIDITY_SOURCES: Record<'Default' | 'MulticollateralBondingCurvePool', LiquiditySourceTypes> = {
  Default: LiquiditySourceTypes.Default,
  MulticollateralBondingCurvePool: LiquiditySourceTypes.MulticollateralBondingCurvePool,
};

const LIQUID_SOURCE_FOR_MARKET: Record<MarketType, LiquiditySourceTypes> = {
  [MarketType.SMART]: SORA_LIQUIDITY_SOURCES.Default,
  [MarketType.TBC]: SORA_LIQUIDITY_SOURCES.MulticollateralBondingCurvePool,
};

const SUBSTRATE_EVM_UTILITY_ASSETS: Record<string, string> = {
  moonriver: 'movr',
  moonbeam: 'glmr',
};

const TON_ID = '2ba4723a-74b4-4a6f-a888-e51937773807-239';

export { TON_ID, LIQUID_SOURCE_FOR_MARKET, SUBSTRATE_EVM_UTILITY_ASSETS, SORA_LIQUIDITY_SOURCES };
