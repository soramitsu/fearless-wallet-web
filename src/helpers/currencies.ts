import { Wallet } from 'ethers';
import type { NetworkName, AssetsPrice } from '@/interfaces';
import { SORA_UTILITY_ASSET, SORA_NETWORK_NAME, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { isSora } from '@/helpers';
import { getNativeAssetName } from '@/extension/background/extension-base/src/background/utils/utils';
import { BalanceItem } from '@/extension/background/extension-base/src/api/evm/types/ether';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import store from '@/store';
import { getSummaryTransferableBalance } from '@/helpers/common';

function defaultSortingCurrencies(currencies: TokenBalance[], { tokenPriceMap }: AssetsPrice, network: NetworkName) {
  const relayChains = [];

  const currenciesWithAssetsAndWithFiatBalance = currencies.filter(
    ({ balances, priceId }) => balances.some(({ total }) => total !== '0') && tokenPriceMap[priceId ?? ''] !== 0
  );

  const currenciesWithAssetsAndWithoutFiatBalance = currencies.filter(
    ({ balances, priceId }) => balances.some(({ total }) => total !== '0') && tokenPriceMap[priceId ?? ''] === 0
  );

  const currenciesWithoutAssets = currencies.filter(({ balances }) => balances.every(({ total }) => total === '0'));

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
  ];
}

function getProviderUrl(name: 'moonpay' | 'ramp', asset: string, address: string) {
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
  const network = store.getters.getNetwork(balance.name) as NetworkJson;

  const favoriteNetworks = store.getters.getFavoriteNetworksNames as { name: string; favorite: string[] }[];
  const { address } = store.getters.getSelectedWallet as Wallet;

  if (selectedNetwork === POPULAR_NETWORKS) return !!network.popular;

  if (selectedNetwork === FAVORITE_NETWORKS) {
    return favoriteNetworks.some(
      ({ name, favorite }) => name.toLowerCase() === balance.name.toLowerCase() && favorite.includes(address)
    );
  }

  return balance.name.toLowerCase() === selectedNetwork.toLowerCase();
}

export {
  getCurrencyOptions,
  getProviderUrl,
  defaultSortingCurrencies,
  getUtilityAsset,
  getXORCurrency,
  filterBalanceItemsByNetwork,
};
