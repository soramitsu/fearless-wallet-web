export function formattedNumber(number: number, decimalsValue = 2, fixedValue = true): string {
  const decimals = 10 ** decimalsValue;
  const roundValue = Math.round(decimals * number) / decimals;

  // if roundValue is equal 0 and number is not equal 0, return origin number
  if (roundValue === 0 && number !== 0) return number.toString();

  return fixedValue && roundValue !== 0 ? roundValue.toFixed(decimalsValue) : roundValue.toString();
}

export function formattedPrice(price: number): string {
  const decimals = price < 0.00001 ? 6 : price < 0.0001 ? 5 : price < 0.001 ? 4 : price < 0.01 ? 3 : 2;

  return formattedNumber(price, decimals);
}
