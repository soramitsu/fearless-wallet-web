import { FPNumber } from '@/util/fp';

export function formattedNumber(
  number: number,
  decimalsValue = 2,
  returnOriginNumber = true,
  removeTrailingZeros = false
): string {
  const decimals = 10 ** decimalsValue;
  const roundValue = Math.round(decimals * number) / decimals;

  // if roundValue is equal 0 and number is not equal 0, return origin number
  if (returnOriginNumber && roundValue === 0 && number >= 0.000000001) return number.toFixed(9);

  if (removeTrailingZeros) return parseFloat(roundValue.toString()).toString();

  return roundValue !== 0 ? roundValue.toFixed(decimalsValue) : roundValue.toString();
}

export function formattedPrice(price: number): string {
  const decimals = price < 0.00001 ? 6 : price < 0.0001 ? 5 : price < 0.001 ? 4 : price < 0.01 ? 3 : 2;

  return formattedNumber(price, decimals);
}

export function addNumbers(values: string[]): string {
  return values.reduce((sum, number) => sum.add(new FPNumber(number)), FPNumber.ZERO).toString();
}
