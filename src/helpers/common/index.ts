import type { TokenBalance } from '@extension-base/background/types/types';
import { addNumbers } from '@/helpers/numbers';
import { ALL_NETWORKS, FAVORITE_NETWORKS, NETWORKS_GROUPS, POPULAR_NETWORKS } from '@/consts/networks';
import { APIItemState } from '@/extension/background/extension-base/src/api/types/networks';
import { AssetsPrice, ChangeWalletBalance, NetworkName } from '@/interfaces';
import { FEARLESS_TITLE } from '@/consts/global';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

export function isNetworkGroup(network: string) {
  return NETWORKS_GROUPS.some((group) => group.toLowerCase() === network.toLowerCase());
}

export function getTransferableBalanceInNetwork(token: TokenBalance, network: string) {
  return token.balances?.find(({ name }) => name.toLowerCase() === network.toLowerCase())?.transferable ?? '0';
}

export function getSummaryTransferableWalletBalance(
  address: string,
  tokens: TokenBalance[],
  price: AssetsPrice,
  network: NetworkName, // network name or group name
  networks: NetworkJson[]
): number {
  return tokens.reduce((result, token) => {
    const { balances, priceId } = token;
    const tokenPrice = price.tokenPriceMap[priceId ?? ''] ?? 0;

    if (!isNetworkGroup(network)) {
      const assetCount = getTransferableBalanceInNetwork(token, network);
      const assetValue = +assetCount * tokenPrice;

      return result + assetValue;
    }

    // TODO: нужна проверка на то, входит ли сеть в группу
    balances.forEach(({ state, transferable, name }) => {
      const networkParams = networks.find(({ name: _name }) => _name.toLowerCase() === name.toLowerCase());

      if (network === POPULAR_NETWORKS && networkParams?.rank === undefined) return result;

      if (network === FAVORITE_NETWORKS && !networkParams?.favorite.includes(address)) return result;

      if (state === APIItemState.READY) {
        const assetCount = +(transferable ?? 0);
        const assetValue = assetCount * tokenPrice;

        result += assetValue;
      }
    });

    return result;
  }, 0);
}

export function getSummaryTransferableBalance(token: TokenBalance, network = ALL_NETWORKS) {
  if (!isNetworkGroup(network)) return getTransferableBalanceInNetwork(token, network);

  // TODO: нужна проверка на то, входит ли сеть в группу
  return token.balances.reduce((result, { state, transferable }) => {
    if (state === APIItemState.READY && transferable) result += +transferable;

    return result;
  }, 0);
}

export function getSummaryLockedBalance(token: TokenBalance) {
  return token.balances?.reduce((result, { state, locked }) => {
    if (state === APIItemState.READY && locked) result += +locked;

    return result;
  }, 0);
}

export function getChangeWalletBalance(
  tokens: TokenBalance[],
  price: AssetsPrice,
  network: NetworkName // network name or group name
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

export const setTitle = (title = FEARLESS_TITLE) => (document.title = title);
