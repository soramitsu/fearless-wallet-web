import { FPNumber } from '@sora-substrate/util';

interface Options {
  decimalsValue?: number;
  returnOriginNumber?: boolean;
  removeTrailingZeros?: boolean;
}

interface DecimalStringOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  preserveSmallValue?: boolean;
  groupSeparator?: string;
  decimalSeparator?: string;
}

function getOptions(options: Options) {
  return {
    decimalsValue: options.decimalsValue ?? 2,
    returnOriginNumber: options.returnOriginNumber ?? true,
    removeTrailingZeros: options.removeTrailingZeros ?? false,
  };
}

function formattedNumber(number: number, options: Options = {}): string {
  const { decimalsValue, returnOriginNumber, removeTrailingZeros } = getOptions(options);

  const decimals = 10 ** decimalsValue;
  const roundValue = Math.round(decimals * number) / decimals;

  // if roundValue is equal 0 and number is not equal 0, return origin number
  if (returnOriginNumber && roundValue === 0 && number >= 0.000000001) return number.toFixed(9);

  if (removeTrailingZeros || roundValue === 0) return roundValue.toString();

  return roundValue.toFixed(decimalsValue);
}

function addNumbers(values: (string | number)[]): string {
  return values.reduce((sum, number) => sum.add(new FPNumber(number)), FPNumber.ZERO).toString();
}

/** Formats a decimal without crossing the IEEE-754 number boundary. */
function formatDecimalString(value: string | number, options: DecimalStringOptions = {}): string {
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = Math.max(options.maximumFractionDigits ?? 4, minimumFractionDigits);
  const groupSeparator = options.groupSeparator ?? ',';
  const decimalSeparator = options.decimalSeparator ?? '.';

  try {
    const amount = new FPNumber(String(value));
    if (!amount.isFinity()) return '0';

    let rounded = amount.toFixed(maximumFractionDigits);
    if (options.preserveSmallValue && !amount.isZero() && new FPNumber(rounded).isZero()) {
      rounded = amount.toString();
    }

    const negative = rounded.startsWith('-');
    const unsigned = negative ? rounded.slice(1) : rounded;
    const [whole = '0', initialFraction = ''] = unsigned.split('.');
    let fraction = initialFraction;

    while (fraction.length > minimumFractionDigits && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
    fraction = fraction.padEnd(minimumFractionDigits, '0');

    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
    return `${negative ? '-' : ''}${grouped}${fraction ? `${decimalSeparator}${fraction}` : ''}`;
  } catch {
    return '0';
  }
}

export { formattedNumber, addNumbers, formatDecimalString };
