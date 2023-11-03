import { Wallet } from 'ethers';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkJson } from '@extension-base/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { TokenBalance } from '@extension-base/background/types';
import type { NetworkName, AssetsPrice, BuyProvider } from '@/interfaces';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS, ALL_NETWORKS } from '@/consts/networks';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { isSora } from '@/helpers';
import store from '@/store';
import { getSummaryTransferableBalance, getTransferableBalanceInNetwork, isNetworkGroup } from '@/helpers/common';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';

function defaultSortingCurrencies(currencies: TokenBalance[], { tokenPriceMap }: AssetsPrice, network: NetworkName) {
  const relayChains = [];

  const currenciesThatReady = currencies.filter(({ balances }) =>
    balances.some(({ state }) => state === APIItemState.READY)
  );

  const currenciesPending = currencies.filter(({ balances }) =>
    balances.every(({ state }) => state === APIItemState.PENDING)
  );
  const currenciesWithError = currencies.filter(({ balances }) =>
    balances.every(({ state }) => state === APIItemState.ERROR)
  );

  const currenciesWithAssetsAndWithFiatBalance = currenciesThatReady.filter(
    ({ balances, priceId }) => balances.some(({ total }) => total !== '0') && tokenPriceMap[priceId ?? ''] !== 0
  );

  const currenciesWithAssetsAndWithoutFiatBalance = currenciesThatReady.filter(
    ({ balances, priceId }) => balances.some(({ total }) => total !== '0') && tokenPriceMap[priceId ?? ''] === 0
  );

  const currenciesWithoutAssets = currenciesThatReady.filter(({ balances }) =>
    balances.every(({ total }) => total === '0')
  );

  const dotIndex = currenciesWithoutAssets.findIndex(({ symbol }) => symbol === 'dot');

  if (dotIndex !== -1) {
    const dot = currenciesWithoutAssets.splice(dotIndex, 1)[0];

    relayChains.push(dot);
  }

  const ksmIndex = currenciesWithoutAssets.findIndex(({ symbol }) => symbol === 'ksm');

  if (ksmIndex !== -1) {
    const ksm = currenciesWithoutAssets.splice(ksmIndex, 1)[0];

    relayChains.push(ksm);
  }

  currenciesWithAssetsAndWithFiatBalance.sort((currency1, currency2) => {
    const totalFiatBalanceOne = +getSummaryTransferableBalance(currency1, network);
    const totalFiatBalanceTwo = +getSummaryTransferableBalance(currency2, network);

    const tokenPriceOne = tokenPriceMap[currency1.priceId ?? ''] ?? 0;
    const tokenPriceTwo = tokenPriceMap[currency2.priceId ?? ''] ?? 0;

    return totalFiatBalanceTwo * tokenPriceTwo - totalFiatBalanceOne * tokenPriceOne;
  });

  currenciesWithAssetsAndWithoutFiatBalance.sort((currency1, currency2) => {
    const totalFiatBalanceOne = +getSummaryTransferableBalance(currency1, network);
    const totalFiatBalanceTwo = +getSummaryTransferableBalance(currency2, network);

    return totalFiatBalanceTwo - totalFiatBalanceOne;
  });

  currenciesWithoutAssets.sort(({ symbol: symbol1 }, { symbol: symbol2 }) => symbol1.localeCompare(symbol2));

  return [
    ...currenciesWithAssetsAndWithFiatBalance,
    ...currenciesWithAssetsAndWithoutFiatBalance,
    ...relayChains,
    ...currenciesWithoutAssets,
    ...currenciesPending,
    ...currenciesWithError,
  ];
}

function getProviderUrl(name: BuyProvider, asset: string, address: string) {
  const { MOONPAY, RAMP } = BASE_URLS_PREFIX;

  const provider = {
    moonpay: `${MOONPAY}/?apiKey=${MOONPAY_API_KEY}&currencyCode=${asset.toLowerCase()}&walletAddress=${address}&showWalletAddressForm=true`,
    ramp: `${RAMP}/?swapAsset=${asset.toUpperCase()}&userAddress=${address}&hostApiKey=${RAMP_API_KEY}`,
  };

  return provider[name];
}

function getCurrencyOptions(currencies: TokenBalance[]) {
  return currencies.map(({ assetId: id, symbol: _symbol, icon, relayChain }) => {
    const assetUpper = _symbol.toUpperCase();
    const filteredOptions = currencies.filter(({ symbol }) => symbol === _symbol);
    const label = filteredOptions.length > 1 ? `${assetUpper} (${relayChain.toUpperCase()})` : assetUpper;

    return {
      name: getNativeAssetName(label).toUpperCase(),
      value: id,
      icon,
    };
  });
}

function getUtilityAsset(balances: TokenBalance[], _network: NetworkName) {
  return balances.find(({ balances }) =>
    balances.some(({ name, isUtility }) => name.toLowerCase() === _network.toLowerCase() && isUtility)
  )!;
}

const getXORCurrency = (balances: TokenBalance[]) => {
  return balances.find(({ symbol }) => symbol === SORA_UTILITY_ASSET && isSora(SORA_NETWORK_NAME))!;
};

function filterBalanceItemsByNetwork(balance: BalanceItem, selectedNetwork: string) {
  const network: NetworkJson = store.getters.getNetwork(balance.name);

  const favoriteNetworks = store.getters.favoriteNetworksNames as { name: string; favorite: string[] }[];
  const { address }: Wallet = store.getters.selectedWallet;

  if (selectedNetwork === POPULAR_NETWORKS) return network.rank !== undefined;

  if (selectedNetwork === FAVORITE_NETWORKS) {
    return favoriteNetworks.some(
      ({ name, favorite }) => name.toLowerCase() === balance.name.toLowerCase() && favorite.includes(address)
    );
  }

  return balance.name.toLowerCase() === selectedNetwork.toLowerCase();
}

export function getSummaryTransferableBalanceFilteredByActiveNetworks(
  token: TokenBalance,
  network: string = ALL_NETWORKS
) {
  if (!isNetworkGroup(network)) return getTransferableBalanceInNetwork(token, network);

  return (
    token.balances?.reduce((result, { state, name, transferable }) => {
      const network = store.getters.getNetwork(name) as NetworkJson;

      if (state === APIItemState.READY && network.active && transferable) result += +transferable;

      return result;
    }, 0) ?? 0
  );
}

export {
  getCurrencyOptions,
  getProviderUrl,
  defaultSortingCurrencies,
  getUtilityAsset,
  getXORCurrency,
  filterBalanceItemsByNetwork,
};
