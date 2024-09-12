import { FPNumber } from '@sora-substrate/util';
import { type Wallet } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkName, AssetsPrice, BuyProvider } from '@/interfaces';
import type { NetworkJson } from '@extension-base/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { getNativeAssetName } from '@/extension/background/extension-base/src/background/handlers/utils';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS, ALL_NETWORKS } from '@/consts/networks';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { isSameString, isSora } from '@/helpers';
import { useStore } from '@/store';
import { getSummaryTransferableBalance, isNetworkGroup } from '@/helpers/common';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

export function getTransferableBalanceInNetwork(token: TokenGroup, network: string) {
  return token.balances?.find(({ name }) => name.toLowerCase() === network.toLowerCase())?.transferable ?? '0';
}

function defaultSortingCurrencies(currencies: TokenGroup[], { tokenPriceMap }: AssetsPrice, network: NetworkName) {
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

function getCurrencyOptions(tokenGroup: TokenGroup[]) {
  return tokenGroup.map(({ groupId, symbol: _symbol, icon, relayChain, tokenName }) => {
    const assetUpper = _symbol.toUpperCase();
    const filteredOptions = tokenGroup.filter(({ symbol }) => symbol === _symbol);
    const label = filteredOptions.length > 1 ? `${assetUpper} (${relayChain.toUpperCase()})` : assetUpper;

    return {
      name: getNativeAssetName(label).toUpperCase(),
      value: groupId,
      subName: tokenName,
      icon,
    };
  });
}

function getUtilityAsset(balances: TokenGroup[], _network: NetworkName) {
  return balances.find(({ balances }) =>
    balances.some(({ name, isUtility }) => isSameString(name, _network) && isUtility)
  )!;
}

const getXORCurrency = (balances: TokenGroup[]) => {
  return balances.find(({ symbol }) => symbol === SORA_UTILITY_ASSET && isSora(SORA_NETWORK_NAME))!;
};

function calcTransferableSendMinusFee(
  currency: TokenGroup | undefined,
  network: NetworkName,
  fee: string,
  checkED = false,
  destNetFee?: string
) {
  if (currency === undefined) return '0';

  const isCrossChain = destNetFee !== undefined;

  const currencyBalance = currency.balances.find(({ name }) => name.toLowerCase() === network.toLowerCase())!;
  const precision = currencyBalance.precision;
  const transferable = currencyBalance.transferable ?? '0';

  const transferableFP = new FPNumber(transferable, precision);
  const destNetFeeFP = new FPNumber(destNetFee ?? 0, precision);

  // ED берем с запасом + 10%
  const existentialDeposit = FPNumber.fromCodecValue(currencyBalance.existentialDeposit ?? '0', precision).mul(
    new FPNumber(1.1, precision)
  );

  // Для Utility ассета вычитаем origin fee, тк origin fee всегда списывается в Utility ассете
  // также проверяем existentialDeposit и дополнительно оставляем на балансе 10% от комисии
  if (currencyBalance.isUtility) {
    const amountSubFee = transferableFP.sub(new FPNumber(fee, precision));
    const amountSubFeeSubDestFee = isCrossChain ? amountSubFee.sub(destNetFeeFP) : amountSubFee;
    const amountSubFeeSubDestFeeSubED = checkED
      ? amountSubFeeSubDestFee.sub(existentialDeposit)
      : amountSubFeeSubDestFee;

    return FPNumber.lt(amountSubFeeSubDestFeeSubED, FPNumber.ZERO) ? '0' : amountSubFeeSubDestFeeSubED.toString();
  }

  // вычитаем CrossChain комиссию и проверяем existentialDeposit для ORML ассета
  if (isCrossChain) {
    const amountSubDestFee = transferableFP.sub(destNetFeeFP);
    const amountSubDestFeeSubED = checkED ? amountSubDestFee.sub(existentialDeposit) : amountSubDestFee;

    return FPNumber.lt(amountSubDestFeeSubED, FPNumber.ZERO) ? '0' : amountSubDestFeeSubED.toString();
  }

  return transferable;
}

function isValidAmountAsset(
  currency: TokenGroup | undefined,
  network: NetworkName,
  fee: string,
  amount: string,
  checkED = false,
  destFee?: string
) {
  const maxSendFP = new FPNumber(calcTransferableSendMinusFee(currency, network, fee, checkED, destFee));

  // если sendAsset !== Utility, то: если количество токенов равно нулю, то транзакция невалидна
  // если  sendAsset === Utility, то: если количество токенов за вычетом комиссии равно нулю, то транзакция невалидна
  if (FPNumber.isEqualTo(maxSendFP, FPNumber.ZERO)) return false;

  // если syncedAmount меньше или равен максимальному количеству токенов, то транзакция валидна
  return FPNumber.lte(new FPNumber(amount), maxSendFP);
}

function filterBalanceItemsByNetwork(balance: BalanceItem, selectedNetwork: string) {
  const store = useStore();
  const network: NetworkJson = store.getters[NetworksGettersTypes.getNetwork](balance.name);
  const favoriteNetworks = store.getters[NetworksGettersTypes.favoriteNetworksNames] as {
    name: string;
    favorite: string[];
  }[];
  const { address }: Wallet = store.getters[AccountsGettersTypes.selectedWallet];

  if (selectedNetwork === POPULAR_NETWORKS) return network.rank !== undefined;

  if (selectedNetwork === FAVORITE_NETWORKS) {
    return favoriteNetworks.some(
      ({ name, favorite }) => isSameString(name, balance.name) && favorite.includes(address)
    );
  }

  return isSameString(balance.name, selectedNetwork);
}

export function getSummaryTransferableBalanceFilteredByActiveNetworks(
  token: TokenGroup,
  network: string = ALL_NETWORKS
) {
  if (!isNetworkGroup(network)) return getTransferableBalanceInNetwork(token, network);

  const store = useStore();

  return (
    token.balances?.reduce((sum, { state, name, transferable }) => {
      const network: NetworkJson = store.getters[NetworksGettersTypes.getNetwork](name);

      if (state === APIItemState.READY && network.active && transferable) sum += +transferable;

      return sum;
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
