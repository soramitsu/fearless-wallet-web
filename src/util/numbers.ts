export function formattedNumber(number: number, decimalsValue = 2, fixedValue = true): string {
  const decimals = 10 ** decimalsValue;
  const roundValue = Math.round(decimals * number) / decimals;

  return fixedValue && roundValue !== 0 ? roundValue.toFixed(decimalsValue) : roundValue.toString();
}

export function formattedPrice(price: number): string {
  const decimals = price < 0.001 ? 4 : price < 0.01 ? 3 : 2;

  return formattedNumber(price, decimals);
}
