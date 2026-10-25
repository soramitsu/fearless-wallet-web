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

// Expected text was produced by the SORA SDK's math package 1.43.0-betaMST-1.0.21, the library the wallet's amount
// text was written against. Each value is shown with at most (never exactly) the requested decimals.
describe('display formats kept from the SORA SDK', () => {
  it.each([
    ['0', '0', '0'],
    ['5', '5', '5'],
    ['50', '50', '50'],
    ['1234', '1,234', '1234'],
    ['1234567', '1,234,567', '1234567'],
    ['1.5', '1.5', '1.5'],
    ['1234.5', '1,234.5', '1234.5'],
    ['1234567.123456789', '1,234,567.1234567', '1234567.1234567'],
    ['12.30000', '12.3', '12.3'],
    ['100', '100', '100'],
    ['-1234.5', '-1,234.5', '-1234.5'],
    ['999999999999999999999.99', '999,999,999,999,999,999,999.99', '999999999999999999999.99'],
    ['NaN', 'NaN', 'NaN'],
  ])('shows %s as %s, and %s without grouping', (value, locale, plain) => {
    expect(new FPNumber(value).toLocaleString()).toBe(locale);
    expect(new FPNumber(value).format()).toBe(plain);
  });
  it('keeps the first significant digit of a value that would round to zero', () => {
    expect(new FPNumber('0.000000001').toLocaleString()).toBe('0.000000001');
    expect(new FPNumber('0.00000001234').toLocaleString()).toBe('0.00000001');
    expect(FPNumber.fromCodecValue('1', 6).toLocaleString()).toBe('0.000001');
  });
  it('reads whole codec amounts the way the amount field shows them', () => {
    expect(FPNumber.fromCodecValue('1234', 0).toLocaleString()).toBe('1,234');
    expect(FPNumber.fromCodecValue('007', 0).toLocaleString()).toBe('7');
    expect(FPNumber.fromCodecValue('0', 0).toLocaleString()).toBe('0');
    expect(FPNumber.HUNDRED.toLocaleString()).toBe('100');
  });
  it('pads to the requested decimals only when asked to keep the order', () => {
    expect(new FPNumber('1234').toLocaleString(3)).toBe('1,234');
    expect(new FPNumber('1234').toLocaleString(3, true)).toBe('1,234.000');
    expect(new FPNumber('1234567.123456789').toLocaleString(3, true)).toBe('1,234,567.123');
    expect(new FPNumber('1.5').format(4, undefined, true)).toBe('1.5');
    expect(new FPNumber('1234.5').format(2, { decimalSeparator: ',', groupSeparator: '.', groupSize: 3 })).toBe('1.234,5');
  });
});
