import { addNumbers } from '../numbers';
import { ALL_NETWORKS } from '@/consts/networks';
import { APIItemState } from '@/extension/background/extension-base/src/api/types/networks';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { AssetsPrice, ChangeWalletBalance, NetworkName } from '@/interfaces';

export function getSummaryTransferableWalletBalance(
  tokens: TokenBalance[],
  price: AssetsPrice,
  network: NetworkName
): number {
  return tokens.reduce((result, { balances, priceId }) => {
    balances.forEach(({ state, transferable, name }) => {
      if (network !== ALL_NETWORKS && name !== network) return;

      if (state === APIItemState.READY) {
        const tokenPrice = price.tokenPriceMap[priceId ?? ''] ?? 0;
        const assetCount = +(transferable ?? 0);
        const assetValue = assetCount * tokenPrice;

        result += assetValue;
      }
    });

    return result;
  }, 0);
}

function getTransferableBalanceInNetwork(token: TokenBalance, network: string) {
  return token.balances.find(({ name }) => name.toLowerCase() === network.toLowerCase())?.transferable ?? '0';
}

export function getSummaryTransferableBalance(token: TokenBalance, network = ALL_NETWORKS) {
  if (network !== ALL_NETWORKS) return getTransferableBalanceInNetwork(token, network);

  return token.balances.reduce((result, { state, transferable }) => {
    if (state === APIItemState.READY && transferable) result += +transferable;

    return result;
  }, 0);
}

export function getSummaryLockedBalance(token: TokenBalance) {
  return token.balances.reduce((result, { state, locked }) => {
    if (state === APIItemState.READY && locked) result += +locked;

    return result;
  }, 0);
}

export function getChangeWalletBalance(
  tokens: TokenBalance[],
  price: AssetsPrice,
  network: NetworkName
): ChangeWalletBalance {
  const changeAssets = tokens.map((token) => {
    const priceChange = price?.tokenPriceChange[token.priceId ?? ''] ?? 0;
    const totalBalance = +getSummaryTransferableBalance(token, network);
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
