import { FPNumber } from '@sora-substrate/util';
import { getTotalBalance } from './currencies';
import type { ChangeWalletBalance, AssetsPrice } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { APIItemState } from '@/extension/background/extension-base/src/api/evm/types/ether';

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

function getSummaryTransferableWalletBalance(tokens: TokenBalance[], price: AssetsPrice): number {
  let walletBalance = 0;

  tokens.forEach((token) => {
    token.balances.forEach((balance) => {
      if (balance.state === APIItemState.READY) {
        const tokenPrice = price.tokenPriceMap[token.priceId ?? ''] ?? 0;
        const assetCount = +(balance.transferable ?? 0);
        const assetValue = assetCount * tokenPrice;

        walletBalance += assetValue;
      }
    });
  });

  return walletBalance;
}

function getChangeWalletBalance(tokens: TokenBalance[], price: AssetsPrice): ChangeWalletBalance {
  const changeAssets = tokens.map((token) => {
    const priceChange = price?.tokenPriceChange[token.priceId ?? ''] ?? 0;
    const totalBalance = +getTotalBalance(token);
    const currentPercent = 100 + (priceChange ?? 0);
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

export { formattedNumber, addNumbers, getChangeWalletBalance, getSummaryTransferableWalletBalance };
