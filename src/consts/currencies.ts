import { FPNumber } from '@sora-substrate/math';

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

export { MOCK_BALANCE, MOCK_FP_BALANCE };
