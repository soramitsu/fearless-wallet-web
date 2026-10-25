import { describe, expect, it } from 'vitest';
import { FPNumber } from '@/sora/number';

describe('local decimal amounts', () => {
  it('round trips integers beyond the JavaScript safe range at all wallet scales', () => {
    for (const scale of [0, 6, 8, 12, 18]) {
      for (const raw of ['0', '1', '9007199254740993123456789', '340282366920938463463374607431768211455']) {
        expect(FPNumber.fromCodecValue(raw, scale).toCodecString()).toBe(raw);
      }
    }
  });
  it('never rounds a transfer upward', () => {
    expect(new FPNumber('1.23456789', 6).toCodecString()).toBe('1234567');
    expect(new FPNumber('0.0000001', 6).toCodecString()).toBe('0');
    expect(new FPNumber('1000000000000.000001', 6).sub('0.000001').toCodecString()).toBe('1000000000000000000');
  });
  it('decodes SCALE values while treating decimal objects as natural units', () => {
    expect(new FPNumber({ toString: () => '1234567' }, 6).toString()).toBe('1.234567');
    expect(new FPNumber(new FPNumber('1.234567'), 6).toCodecString()).toBe('1234567');
  });
  it('retains precise arithmetic and rejects non-finite encoding', () => {
    expect(new FPNumber('0.1').add('0.2').toString()).toBe('0.3');
    expect(new FPNumber(1).div(3).toString()).toBe('0.333333333333333333');
    expect(() => new FPNumber('NaN').toCodecString()).toThrow();
    expect(() => new FPNumber(1).div(0).toCodecString()).toThrow();
    expect(() => new FPNumber(1, -1)).toThrow();
    expect(new FPNumber('garbage').isFinity()).toBe(false);
    expect(FPNumber.fromCodecValue('not-a-number').isFinity()).toBe(false);
  });
});
