import BigNumber from 'bignumber.js';

export type OperatorParam = string | number | BigNumber;
export type OperatorParamFull = FPNumber | string | number | BigNumber;
type NumberType = NumberLike | CodecLike;

type JsonLike = Record<string, unknown> | null | undefined;

export type CodecLike = {
  toJSON(): JsonLike;
  toString(): string;
};

export type CodecString = string;
export type NumberLike = string | number | bigint | FPNumber | BigNumber | null | undefined;

const isNil = (value: unknown): value is null | undefined => value === null || value === undefined;

BigNumber.config({
  FORMAT: {
    decimalSeparator: '.',
    groupSeparator: '',
    fractionGroupSeparator: '',
  },
});

const isFinityString = (str: string) => !['-Infinity', 'Infinity', 'NaN'].includes(str);
const isZeroString = (str: string) => str === '0' || str === '-0';

/**
 * Lightweight fork of `@sora-substrate/math`'s FPNumber tuned for the UI bundle.
 * Keeps the behaviour relied upon across helpers/components without pulling the full util package.
 */
export class FPNumber {
  public static DELIMITERS_CONFIG = {
    thousand: ',',
    decimal: '.',
  };

  public static DEFAULT_PRECISION = 18;
  public static DEFAULT_DECIMAL_PLACES = 7;
  public static DEFAULT_ROUND_MODE: BigNumber.RoundingMode = 3;

  public static readonly ZERO = FPNumber.fromNatural(0);
  public static readonly ONE = FPNumber.fromNatural(1);
  public static readonly TWO = FPNumber.fromNatural(2);
  public static readonly THREE = FPNumber.fromNatural(3);
  public static readonly FOUR = FPNumber.fromNatural(4);
  public static readonly FIVE = FPNumber.fromNatural(5);
  public static readonly TEN = FPNumber.fromNatural(10);
  public static readonly HUNDRED = FPNumber.fromNatural(100);
  public static readonly THOUSAND = FPNumber.fromNatural(1_000);
  public static readonly TEN_THOUSANDS = FPNumber.fromNatural(10_000);

  public static max(...numbers: Array<FPNumber>): FPNumber | null {
    if (!numbers?.length) return null;

    const precision = numbers[0].precision;
    const filtered = numbers.map((item) => item.value);

    return new FPNumber(BigNumber.max(...filtered), precision);
  }

  public static min(...numbers: Array<FPNumber>): FPNumber | null {
    if (!numbers?.length) return null;

    const precision = numbers[0].precision;
    const filtered = numbers.map((item) => item.value);

    return new FPNumber(BigNumber.min(...filtered), precision);
  }

  public static lt(first: FPNumber, second: FPNumber): boolean {
    return first.value.lt(second.value);
  }

  public static lte(first: FPNumber, second: FPNumber): boolean {
    return first.value.lte(second.value);
  }

  public static gt(first: FPNumber, second: FPNumber): boolean {
    return first.value.gt(second.value);
  }

  public static gte(first: FPNumber, second: FPNumber): boolean {
    return first.value.gte(second.value);
  }

  public static eq(first: FPNumber, second: FPNumber): boolean {
    return first.value.eq(second.value);
  }

  public static isEqualTo = FPNumber.eq;
  public static isGreaterThan = FPNumber.gt;
  public static isGreaterThanOrEqualTo = FPNumber.gte;
  public static isLessThan = FPNumber.lt;
  public static isLessThanOrEqualTo = FPNumber.lte;

  public static fromNatural(value: number | string, precision: number = FPNumber.DEFAULT_PRECISION): FPNumber {
    return new FPNumber(value, precision);
  }

  public static fromCodecValue(
    value: number | string | bigint,
    precision: number = FPNumber.DEFAULT_PRECISION
  ): FPNumber {
    let filtered: number | string;

    switch (typeof value) {
      case 'string':
        filtered = value.replace(/[,. ]/g, '');
        break;
      case 'bigint':
        filtered = value.toString();
        break;
      default:
        filtered = value;
        break;
    }

    const bn = new BigNumber(filtered || 0);

    return new FPNumber(bn.div(10 ** precision), precision);
  }

  public readonly value: BigNumber;

  constructor(
    data: NumberType,
    public precision = FPNumber.DEFAULT_PRECISION
  ) {
    let value: BigNumber;

    if (data instanceof BigNumber) {
      value = data;
    } else if (data instanceof FPNumber) {
      value = data.value;
      this.precision = data.precision;
    } else {
      const initialData = this.formatInitialData(data, precision);
      value = initialData instanceof BigNumber ? initialData : new BigNumber(initialData);
    }

    this.value = value.dp(this.precision, 1);
  }

  get codec(): string {
    return this.value.times(10 ** this.precision).toFormat(0);
  }

  public toCodecString(): string {
    return this.codec;
  }

  public toCodecBigInt(): bigint {
    try {
      return BigInt(this.codec);
    } catch (error) {
      console.warn(`[FPNumber] toCodecBigInt: convert "${this.codec}" to BigInt error -> return "0"`, error);

      return BigInt(0);
    }
  }

  public format(dp = FPNumber.DEFAULT_DECIMAL_PLACES, format?: BigNumber.Format, preserveOrder = false): string {
    const value = this.value;

    if (value.isZero()) {
      if (format) {
        return preserveOrder ? value.toFormat(dp, format) : value.toFormat(format);
      }

      return value.toFormat();
    }

    let formatted = value.dp(dp, FPNumber.DEFAULT_ROUND_MODE);

    if (formatted.isZero()) {
      formatted = new BigNumber(value.toFormat().replace(/(0\.0*[1-9])(\d*)/, '$1'));
    }

    if (format) {
      return preserveOrder ? formatted.toFormat(dp, format) : formatted.toFormat(format);
    }

    return formatted.toFormat();
  }

  public toLocaleString(dp = FPNumber.DEFAULT_DECIMAL_PLACES, preserveOrder = false): string {
    const [integer, decimal] = this.format(
      dp,
      {
        groupSize: 3,
        groupSeparator: FPNumber.DELIMITERS_CONFIG.thousand,
        decimalSeparator: FPNumber.DELIMITERS_CONFIG.decimal,
      },
      preserveOrder
    ).split(FPNumber.DELIMITERS_CONFIG.decimal);

    return decimal ? integer.concat(FPNumber.DELIMITERS_CONFIG.decimal, decimal) : integer;
  }

  public toString(): string {
    return this.value.toFormat();
  }

  public toFixed(dp: number = 4): string {
    return this.value.toFixed(dp, FPNumber.DEFAULT_ROUND_MODE);
  }

  public toNumber(dp: number = FPNumber.DEFAULT_DECIMAL_PLACES): number {
    const result = this.value.dp(dp, FPNumber.DEFAULT_ROUND_MODE);

    return result.toNumber();
  }

  public toBigInt(dp: number = FPNumber.DEFAULT_DECIMAL_PLACES): bigint {
    const result = this.value.dp(dp, FPNumber.DEFAULT_ROUND_MODE).toString();

    try {
      return BigInt(result);
    } catch (error) {
      console.warn(`[FPNumber] toBigInt: convert "${result}" to BigInt error -> return "0"`, error);

      return BigInt(0);
    }
  }

  public dp(dp: number = this.precision, roundMode: BigNumber.RoundingMode = FPNumber.DEFAULT_ROUND_MODE): FPNumber {
    const newValue = this.value.dp(dp, roundMode);

    return new FPNumber(newValue, dp);
  }

  public add(target: OperatorParamFull): FPNumber {
    const value = target instanceof FPNumber ? target.value : target;

    return new FPNumber(this.value.plus(value), this.precision);
  }

  public sub(target: OperatorParamFull): FPNumber {
    const value = target instanceof FPNumber ? target.value : target;

    return new FPNumber(this.value.minus(value), this.precision);
  }

  public mul(target: OperatorParamFull): FPNumber {
    const value = target instanceof FPNumber ? target.value : target;

    return new FPNumber(this.value.times(value), this.precision);
  }

  public div(target: OperatorParamFull): FPNumber {
    const value = target instanceof FPNumber ? target.value : target;

    return new FPNumber(this.value.div(value), this.precision);
  }

  public pow(target: OperatorParamFull): FPNumber {
    const value = target instanceof FPNumber ? target.value : target;

    return new FPNumber(this.value.pow(value), this.precision);
  }

  public abs(): FPNumber {
    return new FPNumber(this.value.absoluteValue(), this.precision);
  }

  public sqrt(): FPNumber {
    return new FPNumber(this.value.sqrt(), this.precision);
  }

  public ceil(): FPNumber {
    return new FPNumber(this.value.integerValue(BigNumber.ROUND_CEIL), this.precision);
  }

  public floor(): FPNumber {
    return new FPNumber(this.value.integerValue(BigNumber.ROUND_FLOOR), this.precision);
  }

  public isNaN(): boolean {
    return this.value.isNaN();
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public isLtZero(): boolean {
    return this.lt(FPNumber.ZERO);
  }

  public isLteZero(): boolean {
    return this.lte(FPNumber.ZERO);
  }

  public isGtZero(): boolean {
    return this.gt(FPNumber.ZERO);
  }

  public isGteZero(): boolean {
    return this.gte(FPNumber.ZERO);
  }

  public max(...numbers: Array<FPNumber>): FPNumber {
    return FPNumber.max(this, ...numbers) ?? this;
  }

  public min(...numbers: Array<FPNumber>): FPNumber {
    return FPNumber.min(this, ...numbers) ?? this;
  }

  public lt(number: FPNumber): boolean {
    return FPNumber.lt(this, number);
  }

  public lte(number: FPNumber): boolean {
    return FPNumber.lte(this, number);
  }

  public gt(number: FPNumber): boolean {
    return FPNumber.gt(this, number);
  }

  public gte(number: FPNumber): boolean {
    return FPNumber.gte(this, number);
  }

  public eq(number: FPNumber): boolean {
    return FPNumber.eq(this, number);
  }

  private formatInitialDataString(data: string): string | number {
    if (!data) return '0';
    if (!isFinityString(data)) return data;
    if (isZeroString(data)) return '0';

    const withoutFormatting = data.replace(/[, ]/g, '');

    if (withoutFormatting.includes('e')) {
      return +withoutFormatting;
    }

    const [integer, fractional] = withoutFormatting.split('.') as [string, string | undefined];

    if (!(integer && Number.isFinite(+integer)) || (fractional && !Number.isFinite(+fractional))) {
      return 'NaN';
    }

    return `${integer ?? 0}.${fractional ?? 0}`;
  }

  private formatInitialDataCodec(data: CodecLike, precision: number): BigNumber {
    const json = data.toJSON() as JsonLike & { balance?: string };
    const str = json && !isNil(json.balance) ? `${json.balance}`.replace(/[,. ]/g, '') : data.toString();

    return new BigNumber(str).div(10 ** precision);
  }

  private formatInitialData(data: NumberType, precision: number): OperatorParam {
    if (isNil(data)) {
      console.warn('[FPNumber] formatInitialData: data is nil -> return "0"');

      return 0;
    }

    switch (typeof data) {
      case 'number':
        return data;
      case 'string':
        return this.formatInitialDataString(data);
      case 'bigint':
        return this.formatInitialDataString(data.toString());
      default:
        break;
    }

    if (typeof data === 'object' && data !== null && 'toString' in data && typeof data.toString === 'function') {
      return this.formatInitialDataCodec(data as CodecLike, precision);
    }

    return 0;
  }
}
