import { APIItemState } from '@extension-base//api/types/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { NetworkJson } from '@extension-base/types';
import type { BasePriceJson, TokenGroup } from '@extension-base/background/types/types';
import type { ChangeWalletBalance, NetworkFilter, NetworkName } from '@/interfaces';
import { addNumbers } from '@/helpers/numbers';
import { ALL_NETWORKS } from '@/consts/networks';
import { createNormalizedNetworkNameSet, isNetworkGroup, normalizeNetworkName } from '@/helpers/networkGroups';
import { findBalanceByNetwork } from '@/helpers/balances';
import { useNetworksStore } from '@/stores/networks';

type SummaryOptions = {
  networks?: NetworkJson[];
  favoriteAddress?: string;
};

const buildAllowedNetworkSet = (
  group: NetworkFilter,
  { networks, favoriteAddress }: SummaryOptions
): Set<NetworkName> | null => {
  if (!networks?.length) return null;

  return createNormalizedNetworkNameSet(networks, group, { favoriteAddress });
};

export function getTransferableBalanceInNetwork(token: TokenGroup, network: NetworkName) {
  const balance = findBalanceByNetwork(token.balances, network);

  return balance?.transferable ?? '0';
}

export function getSummaryTransferableWalletBalance(
  address: string,
  tokens: TokenGroup[],
  price: BasePriceJson,
  network: NetworkFilter, // network name or group name
  networks: NetworkJson[]
): number {
  const options: SummaryOptions = { networks, favoriteAddress: address };

  return tokens.reduce((result, token) => {
    const { priceId } = token;
    const tokenPrice = price.tokenPriceMap ? (price.tokenPriceMap[priceId ?? ''] ?? 0) : 0;
    const assetCount = +getSummaryTransferableBalance(token, network, options);
    const assetValue = assetCount * tokenPrice;

    return result + assetValue;
  }, 0);
}

export function getSummaryTransferableBalance(
  token: TokenGroup,
  network: NetworkFilter = ALL_NETWORKS,
  options: SummaryOptions = {}
) {
  if (!isNetworkGroup(network)) return getTransferableBalanceInNetwork(token, network);

  const balances = token.balances ?? [];
  const allowedSet = buildAllowedNetworkSet(network, options);

  return balances.reduce((result, balance) => {
    if (balance.state !== APIItemState.READY || !balance.transferable) return result;

    if (allowedSet) {
      const normalizedBalanceName = normalizeNetworkName(getBalanceNetworkName(balance));

      if (!allowedSet.has(normalizedBalanceName)) return result;
    }

    return result + Number(balance.transferable);
  }, 0);
}

export function getSummaryLockedBalance(token: TokenGroup) {
  return token.balances?.reduce((result, { state, locked }) => {
    if (state === APIItemState.READY && locked) result += +locked;

    return result;
  }, 0);
}

export function getChangeWalletBalance(
  tokens: TokenGroup[],
  price: BasePriceJson,
  network: NetworkFilter, // network name or group name
  options: SummaryOptions = {}
): ChangeWalletBalance {
  const changeAssets = tokens.map((tokenGroup) => {
    const priceChange = price?.tokenPriceChange[tokenGroup.priceId ?? ''] ?? 0;
    const tokenPrice = price?.tokenPriceMap[tokenGroup.priceId ?? ''] ?? 0;

    const currentPercent = 100 + (priceChange ?? 0);

    const totalBalance = +getSummaryTransferableBalance(tokenGroup, network, options);
    const oldBalance = (totalBalance / currentPercent) * 100;

    const changeAmount = totalBalance - oldBalance;
    const changeFiat = changeAmount * tokenPrice;

    const currentFiat = totalBalance * tokenPrice;

    return { changeFiat, currentFiat };
  });

  const totalCurrentFiat = +addNumbers(changeAssets.map(({ currentFiat }) => currentFiat));
  const totalChangeFiat = +addNumbers(changeAssets.map(({ changeFiat }) => changeFiat));
  const totalPercentChange = totalChangeFiat === 0 ? 0 : (totalChangeFiat / totalCurrentFiat) * 100;

  return {
    percent: totalPercentChange,
    amount: totalChangeFiat,
  };
}

export function getSummaryTransferableBalanceFilteredByActiveNetworks(
  token: TokenGroup,
  network: NetworkFilter = ALL_NETWORKS
) {
  if (!isNetworkGroup(network)) return getTransferableBalanceInNetwork(token, network);

  const networksStore = useNetworksStore();

  return (
    token.balances?.reduce((sum, balance) => {
      const networkName = getBalanceNetworkName(balance);
      const networkMeta: NetworkJson = networksStore.getNetwork(networkName);

      if (balance.state === APIItemState.READY && networkMeta.active && balance.transferable)
        sum += +balance.transferable;

      return sum;
    }, 0) ?? 0
  );
}
