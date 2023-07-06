import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { MarketType } from '@/interfaces';

const LIQUID_SOURCE_FOR_MARKET = {
  [MarketType.SMART]: LiquiditySourceTypes.Default,
  [MarketType.TBC]: LiquiditySourceTypes.MulticollateralBondingCurvePool,
};

const ASSETS_ALIASES: Record<string, string> = {
  moonriver_xcksm: 'ksm',
  moonriver_ksm: 'xcksm',
  moonbeam_xcdot: 'dot',
  moonbeam_dot: 'xcdot',
};

export { LIQUID_SOURCE_FOR_MARKET, ASSETS_ALIASES };
