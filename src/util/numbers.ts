export function roundNumber(number: number, decimalsValue = 2) {
  const decimals = 10 ** decimalsValue;

  return Math.round(decimals * number) / decimals;
}
