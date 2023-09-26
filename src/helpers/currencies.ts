import { FPNumber } from '@sora-substrate/util';
import { Wallet } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkName, AssetsPrice, BuyProvider } from '@/interfaces';
import type { NetworkJson } from '@extension-base/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { TokenBalance } from '@extension-base/background/types/types';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS, ALL_NETWORKS } from '@/consts/networks';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { isSameString, isSora } from '@/helpers';
import store from '@/store';
import { getSummaryTransferableBalance, isNetworkGroup } from '@/helpers/common';

export function getTransferableBalanceInNetwork(token: TokenBalance, network: string) {
  return token.balances?.find(({ name }) => name.toLowerCase() === network.toLowerCase())?.transferable ?? '0';
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

function getProviderUrl(name: BuyProvider, asset: string, address: string) {
  const { MOONPAY, RAMP } = BASE_URLS_PREFIX;

  const provider = {
    moonpay: `${MOONPAY}/?apiKey=${MOONPAY_API_KEY}&currencyCode=${asset.toLowerCase()}&walletAddress=${address}&showWalletAddressForm=true`,
    ramp: `${RAMP}/?swapAsset=${asset.toUpperCase()}&userAddress=${address}&hostApiKey=${RAMP_API_KEY}`,
  };

  return provider[name];
}

function getCurrencyOptions(currencies: TokenBalance[]) {
  return currencies.map(({ assetId: id, symbol, icon, relayChain }) => {
    const filteredOptions = currencies.filter(({ symbol: _symbol }) => symbol === _symbol);
    const label = filteredOptions.length > 1 ? `${symbol} (${relayChain})` : symbol;

    return {
      name: label.toUpperCase(),
      value: id,
      icon,
    };
  });
}

function getUtilityAsset(balances: TokenBalance[], _network: NetworkName) {
  return balances.find(({ balances }) =>
    balances.some(({ name, isUtility }) => isSameString(name, _network) && isUtility)
  )!;
}

const getXORCurrency = (balances: TokenBalance[]) => {
  return balances.find(({ symbol }) => symbol === SORA_UTILITY_ASSET && isSora(SORA_NETWORK_NAME))!;
};

function calcTransferableSendMinusFee(
  currency: TokenBalance | undefined,
  network: NetworkName,
  fee: string,
  destNetFee?: string
) {
  if (currency === undefined) return '0';

  const isCrossChain = destNetFee !== undefined;
  const destNetFeeFP = new FPNumber(destNetFee ?? 0);

  const currencyBalance = currency.balances.find(({ name }) => name.toLowerCase() === network.toLowerCase())!;
  const transferable = currencyBalance.transferable ?? '0';

  // Для Utility ассета вычитаем комиссию, тк комиссия всегда списывается в Utility токене
  if (currencyBalance.isUtility) {
    const amountSubFee = new FPNumber(transferable).sub(new FPNumber(fee));
    const amountSubFeeSubDestFee = isCrossChain ? amountSubFee.sub(destNetFeeFP) : amountSubFee;

    return FPNumber.lt(amountSubFeeSubDestFee, FPNumber.ZERO) ? '0' : amountSubFeeSubDestFee.toString();
  }

  // вычитаем CrossChain комиссию
  if (isCrossChain) {
    const amountSubDestFee = new FPNumber(transferable).sub(destNetFeeFP);

    return FPNumber.lt(amountSubDestFee, FPNumber.ZERO) ? '0' : amountSubDestFee.toString();
  }

  return transferable;
}

function isValidAmountAsset(currency: TokenBalance | undefined, network: NetworkName, fee: string, amount: string) {
  const maxSendFP = new FPNumber(calcTransferableSendMinusFee(currency, network, fee));

  // если sendAsset !== Utility, то: если количество токенов равно нулю, то транзакция невалидна
  // если  sendAsset === Utility, то: если количество токенов за вычетом комиссии равно нулю, то транзакция невалидна
  if (FPNumber.isEqualTo(maxSendFP, FPNumber.ZERO)) return false;

  // если syncedAmount меньше или равен максимальному количеству токенов, то транзакция валидна
  return FPNumber.lte(new FPNumber(amount), maxSendFP);
}

function filterBalanceItemsByNetwork(balance: BalanceItem, selectedNetwork: string) {
  const network = store.getters.getNetwork(balance.name) as NetworkJson;

  const favoriteNetworks = store.getters.getFavoriteNetworksNames as { name: string; favorite: string[] }[];
  const { address } = store.getters.selectedWallet as Wallet;

  if (selectedNetwork === POPULAR_NETWORKS) return network.rank !== undefined;

  if (selectedNetwork === FAVORITE_NETWORKS) {
    return favoriteNetworks.some(
      ({ name, favorite }) => name.toLowerCase() === balance.name.toLowerCase() && favorite.includes(address)
    );
  }

  return balance.name.toLowerCase() === selectedNetwork.toLowerCase();
}

export function getSummaryTransferableBalanceFilteredByActiveNetworks(token: TokenBalance, network = ALL_NETWORKS) {
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
  calcTransferableSendMinusFee,
  isValidAmountAsset,
  filterBalanceItemsByNetwork,
};
