import type { Currencies, Currency } from '@/interfaces/currencies';
import type { TokenPriceJson } from '@/interfaces/tokens';
import type { Networks } from '@/interfaces/networks';
import type { Wallet } from '@/store/accounts/types';
import CurrencyController from '@/controllers/currencyController';
import NetworksController from '@/controllers/networksController';

function getMockCurrencies(networks: Networks): Currencies {
  const assets = NetworksController.getAssets();

  const currencies = networks
    .reduce((result, network) => {
      const { assets: networkAssets, name, parentId } = network;
      const tokenId = networkAssets.find(({ isUtility }) => isUtility)!.assetId; // eslint-disable-line
      const token = assets.find(({ id }) => id === tokenId)!.symbol; // eslint-disable-line
      const purchaseProviders = networkAssets[0]?.purchaseProviders ?? [];
      const parentNetwork = networks.find(({ chainId }) => chainId === parentId)?.name;
      const tokenIndex = result.findIndex(({ tokenId: savedTokenId }) => savedTokenId === tokenId);

      if (tokenIndex === -1)
        result.push({
          mainNetwork: name,
          tokenId,
          token,
          parentNetwork,
          precision: 0,
          tokenPriceJson: {} as TokenPriceJson,
          purchaseProviders,
        });

      return result;
    }, [] as any[])
    .map(
      ({ mainNetwork, tokenPriceJson, precision, tokenId, parentNetwork, token, purchaseProviders }) =>
        new CurrencyController(mainNetwork, tokenId, token, tokenPriceJson, precision, purchaseProviders, parentNetwork)
    );

  return currencies;
}

function defaultSortingCurrencies(currencies: Currency[], wallet: Wallet) {
  const relayChains = [];
  const currenciesWithTokens = currencies.filter((currency) => currency.getTotalCountTokens(wallet) !== '0');
  const currenciesWithoutTokens = currencies.filter((currency) => currency.getTotalCountTokens(wallet) === '0');

  const dotIndex = currenciesWithoutTokens.findIndex(({ token }) => token === 'dot');
  const ksmIndex = currenciesWithoutTokens.findIndex(({ token }) => token === 'ksm');

  if (dotIndex !== -1) {
    const dot = currenciesWithoutTokens.splice(dotIndex, 1)[0];

    relayChains.push(dot);
  }

  if (ksmIndex !== -1) {
    const ksm = currenciesWithoutTokens.splice(ksmIndex, 1)[0];

    relayChains.push(ksm);
  }

  currenciesWithTokens.sort((currency1, currency2) => {
    const totalBalanceOne = +currency1.getTotalBalance(wallet);
    const totalBalanceTwo = +currency2.getTotalBalance(wallet);

    return totalBalanceTwo - totalBalanceOne;
  });

  currenciesWithoutTokens.sort(({ token: token1 }, { token: token2 }) => token1.localeCompare(token2));

  return [...currenciesWithTokens, ...relayChains, ...currenciesWithoutTokens];
}

function getProviderUrl(providerName: string, token: string, address: string) {
  switch (providerName) {
    case 'moonpay':
      return `https://buy.moonpay.com/?currencyCode=${token}&walletAddress=${address}&showWalletAddressForm=true`;
    case 'ramp':
      return `https://buy.ramp.network/?swapAsset=${token.toUpperCase()}&userAddress=${address}`;
    default:
      return '';
  }
}

function getCurrencyOptions(currencies: Currencies) {
  return currencies.map(({ token, tokenId, parentNetwork }) => {
    const tokenUpper = token.toUpperCase();
    const filteredOptions = currencies.filter(({ token: _token }) => _token === token);
    const label = filteredOptions.length > 1 ? `${tokenUpper} (${parentNetwork.toUpperCase()})` : tokenUpper;

    return {
      label,
      value: tokenId,
    };
  });
}

export { getCurrencyOptions, getProviderUrl, defaultSortingCurrencies, getMockCurrencies };
