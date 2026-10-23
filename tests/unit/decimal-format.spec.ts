import { describe, expect, it } from 'vitest';
import { formatDecimalString } from '@/helpers/numbers';

describe('decimal-string rendering', () => {
  it('formats values above Number.MAX_SAFE_INTEGER without rounding through Number', () => {
    expect(
      formatDecimalString('9007199254740993.125', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe('9,007,199,254,740,993.12');
  });

  it('keeps very small positive asset balances visible', () => {
    expect(
      formatDecimalString('0.000000000000000001', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
        preserveSmallValue: true,
      })
    ).toBe('0.000000000000000001');
  });
});
