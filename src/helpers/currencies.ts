import type { NetworkName, AssetsPrice, ChangeWalletBalance } from '@/interfaces';
import { ALL_NETWORKS, SORA_UTILITY_ASSET, SORA_NETWORK_NAME } from '@/consts/networks';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { isSora } from '@/helpers/common';
import { addNumbers } from '@/helpers/numbers';
import { APIItemState } from '@/extension/background/extension-base/src/api/types/networks';

function getTransferableBalanceInNetwork(token: TokenBalance, network: string) {
  return token.balances.find(({ name }) => name.toLowerCase() === network.toLowerCase())?.transferable ?? '0';
}

function getSummaryTransferableBalance(token: TokenBalance, network = ALL_NETWORKS) {
  if (network !== ALL_NETWORKS) return getTransferableBalanceInNetwork(token, network);

  return token.balances.reduce((result, { state, transferable }) => {
    if (state === APIItemState.READY && transferable) result += +transferable;

    return result;
  }, 0);
}

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

function getSummaryTransferableWalletBalance(tokens: TokenBalance[], price: AssetsPrice, network: NetworkName): number {
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

function getChangeWalletBalance(tokens: TokenBalance[], price: AssetsPrice, network: NetworkName): ChangeWalletBalance {
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
      name: label,
      value: id,
      icon,
    };
  });
}

function getUtilityAsset(currencies: TokenBalance[], _network: NetworkName) {
  const currency = currencies.find(({ balances }) =>
    balances.some(
      ({ name, type }) => name.toLowerCase() === _network.toLowerCase() && (type === 'normal' || type === 'equilibrium')
    )
  );

  if (!currency) return '';

  return currency.symbol;
}

const getXORCurrency = (balances: TokenBalance[]) => {
  return balances.find(({ symbol }) => symbol === SORA_UTILITY_ASSET && isSora(SORA_NETWORK_NAME))!;
};

export {
  getCurrencyOptions,
  getProviderUrl,
  defaultSortingCurrencies,
  getUtilityAsset,
  getXORCurrency,
  getChangeWalletBalance,
  getSummaryTransferableWalletBalance,
  getSummaryTransferableBalance,
};
