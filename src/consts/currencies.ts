import { FPNumber } from '@sora-substrate/util';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { MarketType } from '@/interfaces';

const MOCK_FP_BALANCE = {
  frozen: FPNumber.ZERO,
  locked: FPNumber.ZERO,
  reserved: FPNumber.ZERO,
  total: FPNumber.ZERO,
  transferable: FPNumber.ZERO,
};

const MOCK_BALANCE = {
  frozen: {
    value: '0',
    fiat: '0',
  },
  locked: {
    value: '0',
    fiat: '0',
  },
  reserved: {
    value: '0',
    fiat: '0',
  },
  total: {
    value: '0',
    fiat: '0',
  },
  transferable: {
    value: '0',
    fiat: '0',
  },
};

const LIQUID_SOURCE_FOR_MARKET = {
  [MarketType.SMART]: LiquiditySourceTypes.Default,
  [MarketType.TBC]: LiquiditySourceTypes.MulticollateralBondingCurvePool,
};

export { MOCK_BALANCE, MOCK_FP_BALANCE, LIQUID_SOURCE_FOR_MARKET };
