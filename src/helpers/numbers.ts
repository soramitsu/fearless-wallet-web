import { FPNumber } from '@sora-substrate/util';

interface Options {
  decimalsValue?: number;
  returnOriginNumber?: boolean;
  removeTrailingZeros?: boolean;
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

export { formattedNumber, addNumbers };
