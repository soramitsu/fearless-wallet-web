import BigNumber from 'bignumber.js';

// Isolated configuration: importing this module never changes other users of BigNumber.
const Decimal = BigNumber.clone({ DECIMAL_PLACES: 80, ROUNDING_MODE: BigNumber.ROUND_FLOOR, EXPONENTIAL_AT: 1e9 });
// The display formats of the SORA SDK's math package (1.43), which the wallet's amount text was written against: no
// grouping unless asked for, and at most (never exactly) `dp` decimals.
const PLAIN_FORMAT: BigNumber.Format = Object.freeze({ decimalSeparator: '.', groupSeparator: '', fractionGroupSeparator: '' });
const LOCALE_FORMAT: BigNumber.Format = Object.freeze({ groupSize: 3, groupSeparator: ',', decimalSeparator: '.' });
export type CodecString = string;
type Input = FPNumber | BigNumber | string | number | bigint | { toString(): string };
const valueOf = (input: Input): BigNumber.Value => input instanceof FPNumber ? input.value : typeof input === 'bigint' ? input.toString() : input as BigNumber.Value;

/** Wallet-owned decimal amounts. Only codec conversion applies the asset's scale. */
export class FPNumber {
  static DEFAULT_PRECISION = 18;
  static DEFAULT_DECIMAL_PLACES = 7;
  static DEFAULT_ROUND_MODE: BigNumber.RoundingMode = BigNumber.ROUND_FLOOR;
  static get ZERO() { return new FPNumber(0); }
  static get ONE() { return new FPNumber(1); }
  static get TWO() { return new FPNumber(2); }
  static get HUNDRED() { return new FPNumber(100); }
  readonly value: BigNumber;
  readonly precision: number;

  constructor(input: Input, precision = FPNumber.DEFAULT_PRECISION) {
    if (!Number.isInteger(precision) || precision < 0 || precision > 255) throw new Error('Invalid asset precision');
    this.precision = precision;
    const isCodec = input && typeof input === 'object' && !(input instanceof FPNumber) && !BigNumber.isBigNumber(input);
    let number: BigNumber;
    try { number = isCodec ? new Decimal(input.toString()).shiftedBy(-precision) : new Decimal(valueOf(input)); }
    catch { number = new Decimal(NaN); }
    this.value = number.decimalPlaces(precision, FPNumber.DEFAULT_ROUND_MODE);
  }
  static fromCodecValue(value: string | number | bigint, precision = 18) {
    try { return new FPNumber(new Decimal(value.toString()).shiftedBy(-precision), precision); }
    catch { return new FPNumber(NaN, precision); }
  }
  static fromNatural(value: string | number, precision = 18) { return new FPNumber(value, precision); }
  static max(...values: FPNumber[]) { return values.reduce((a, b) => a === null || b.gt(a) ? b : a, null as FPNumber | null); }
  static min(...values: FPNumber[]) { return values.reduce((a, b) => a === null || b.lt(a) ? b : a, null as FPNumber | null); }
  static lt(a: FPNumber, b: FPNumber) { return a.lt(b); }
  static lte(a: FPNumber, b: FPNumber) { return a.lte(b); }
  static gt(a: FPNumber, b: FPNumber) { return a.gt(b); }
  static gte(a: FPNumber, b: FPNumber) { return a.gte(b); }
  static eq(a: FPNumber, b: FPNumber) { return a.eq(b); }
  static isEqualTo = FPNumber.eq;
  static isLessThan = FPNumber.lt;
  static isLessThanOrEqualTo = FPNumber.lte;
  static isGreaterThan = FPNumber.gt;
  static isGreaterThanOrEqualTo = FPNumber.gte;
  private wrap(value: BigNumber) { return new FPNumber(value, this.precision); }
  get codec() { return this.toCodecString(); }
  toCodecString() {
    if (!this.value.isFinite()) throw new Error('Cannot encode a non-finite amount');
    return this.value.shiftedBy(this.precision).toFixed(0, BigNumber.ROUND_DOWN);
  }
  toCodecBigInt() { return BigInt(this.toCodecString()); }
  toString() { return this.value.toFixed(); }
  toJSON() { return this.toString(); }
  toFixed(dp = 4) { return this.value.toFixed(dp, FPNumber.DEFAULT_ROUND_MODE); }
  toNumber(dp = FPNumber.DEFAULT_DECIMAL_PLACES) { return this.value.decimalPlaces(dp, FPNumber.DEFAULT_ROUND_MODE).toNumber(); }
  toBigInt() { return BigInt(this.value.toFixed(0, BigNumber.ROUND_DOWN)); }
  /** Rounded down to at most `dp` decimals without trailing zeros (with a `format`, `preserveOrder` pads to `dp`); a
   * non-zero value that would round to zero keeps its first significant digit, so 0.000000001 never reads as 0. */
  format(dp = FPNumber.DEFAULT_DECIMAL_PLACES, format?: BigNumber.Format, preserveOrder = false) {
    const value = this.value;
    let shown = value.isZero() ? value : value.decimalPlaces(dp, FPNumber.DEFAULT_ROUND_MODE);
    if (shown.isZero() && !value.isZero()) shown = new Decimal(value.toFormat(PLAIN_FORMAT).replace(/(0\.0*[1-9])(\d*)/, '$1'));
    if (!format) return shown.toFormat(PLAIN_FORMAT);
    return preserveOrder ? shown.toFormat(dp, format) : shown.toFormat(format);
  }
  /** `format` with thousands grouped by commas, as the amount fields show them. */
  toLocaleString(dp = FPNumber.DEFAULT_DECIMAL_PLACES, preserveOrder = false) { return this.format(dp, LOCALE_FORMAT, preserveOrder); }
  dp(dp = this.precision, rounding = FPNumber.DEFAULT_ROUND_MODE) { return this.wrap(this.value.decimalPlaces(dp, rounding)); }
  add(other: Input) { return this.wrap(this.value.plus(valueOf(other))); }
  sub(other: Input) { return this.wrap(this.value.minus(valueOf(other))); }
  mul(other: Input) { return this.wrap(this.value.times(valueOf(other))); }
  div(other: Input) { return this.wrap(this.value.dividedBy(valueOf(other))); }
  mod(other: Input) { return this.wrap(this.value.modulo(valueOf(other))); }
  pow(other: Input) { return this.wrap(this.value.pow(valueOf(other))); }
  sqrt() { return this.wrap(this.value.sqrt()); }
  negative() { return this.wrap(this.value.negated()); }
  abs() { return this.wrap(this.value.abs()); }
  isNaN() { return this.value.isNaN(); }
  isFinity() { return this.value.isFinite(); }
  isZero() { return this.value.isZero(); }
  isLtZero() { return this.value.lt(0); }
  isLteZero() { return this.value.lte(0); }
  isGtZero() { return this.value.gt(0); }
  isGteZero() { return this.value.gte(0); }
  isZeroMod(other: Input) { return this.mod(other).isZero(); }
  lt(other: Input) { return this.value.lt(valueOf(other)); }
  lte(other: Input) { return this.value.lte(valueOf(other)); }
  gt(other: Input) { return this.value.gt(valueOf(other)); }
  gte(other: Input) { return this.value.gte(valueOf(other)); }
  eq(other: Input) { return this.value.eq(valueOf(other)); }
  isLessThan(other: Input) { return this.lt(other); }
  isLessThanOrEqualTo(other: Input) { return this.lte(other); }
  isGreaterThan(other: Input) { return this.gt(other); }
  isGreaterThanOrEqualTo(other: Input) { return this.gte(other); }
  isEqualTo(other: Input) { return this.eq(other); }
  max(...others: FPNumber[]) { return FPNumber.max(this, ...others)!; }
  min(...others: FPNumber[]) { return FPNumber.min(this, ...others)!; }
}
