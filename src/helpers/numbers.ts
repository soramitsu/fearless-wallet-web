import { FPNumber } from '@sora-substrate/util';
import type { Currencies, ChangeWalletBalance } from '@/interfaces';

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

function addN1umbers(values: (string | number)[]): string {
  return values.reduce((sum, number) => sum.add(new FPNumber(number)), FPNumber.ZERO).toString();
}

function getChangeWalletBalance(currencies: Currencies, address: string, ethereumAddress: string): ChangeWalletBalance {
  const changeAssets = currencies.map((currency) => {
    const { hours24Change } = currency;
    const totalBalance = +currency.getTransferableFiatBalance({ address, ethereumAddress });
    const currentPercent = 100 + (hours24Change ?? 0);
    const oldBalance = (totalBalance / currentPercent) * 100;
    const changeAmount = totalBalance - oldBalance;

    return { totalBalance, changeAmount };
  });

  const totalChange = +addNumbers(changeAssets.map(({ changeAmount }) => changeAmount));
  const totalBalance = +addNumbers(changeAssets.map(({ totalBalance }) => totalBalance));
  const totalPercentChange = totalBalance === 0 ? 0 : (totalChange / totalBalance) * 100;

  return {
    percent: totalPercentChange,
    amount: totalChange,
  };
}

export { formattedNumber, addNumbers, getChangeWalletBalance };
