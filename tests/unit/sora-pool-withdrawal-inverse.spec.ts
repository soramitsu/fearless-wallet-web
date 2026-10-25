import { describe, expect, it } from 'vitest';
import { poolMarkerForAmount, poolWithdrawal } from '@/sora/pools';

describe('SORA pool withdrawal inverse at the full-burn boundary', () => {
  it.each(['1000', '1001', '1999'])('does not turn an unrepresentable partial amount %s into a full or excessive burn', requested => {
    // The runtime adds 1000 virtual LP atoms for partial withdrawals. Burning
    // 999 gives 999 asset atoms; burning all 1000 gives all 2000 asset atoms.
    expect(poolWithdrawal('999', '2000', '1000')).toBe('999');
    expect(poolWithdrawal('1000', '2000', '1000')).toBe('2000');
    expect(() => poolMarkerForAmount(requested, '2000', '1000', '1000')).toThrow('partial withdrawal cannot be represented');
  });

  it('retains explicit full withdrawal and representable partial withdrawals', () => {
    expect(poolMarkerForAmount('2000', '2000', '1000', '1000')).toBe('1000');
    expect(poolMarkerForAmount('999', '2000', '1000', '1000')).toBe('999');
    expect(poolMarkerForAmount('500', '2000', '1000', '500')).toBe('500');
    expect(() => poolMarkerForAmount('501', '2000', '1000', '500')).toThrow('available pool position');
  });

  it('rounds a partial burn upward by one atom without exceeding the holding', () => {
    const marker = poolMarkerForAmount('1', '1000', '1000', '500');
    expect(marker).toBe('2');
    expect(poolWithdrawal(marker, '1000', '1000')).toBe('1');
    expect(poolWithdrawal('1', '1000', '1000')).toBe('0');
  });
});
