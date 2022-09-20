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
      const { assets: networkAssets, name: mainNetwork, parentId } = network;
      const relayChain = networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNetwork;

      networkAssets.forEach(({ assetId, purchaseProviders }) => {
        const { symbol } = assets.find(({ id }) => id === assetId)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
        const tokenIndex = result.findIndex(({ assetId: _assetId, symbol: _symbol, relayChain: _relayChain }) => {
          const isExistingTokenId = _assetId === assetId;
          const isExistingTokenSymbol = _symbol === symbol && _relayChain === relayChain;

          return isExistingTokenId || isExistingTokenSymbol;
        });

        if (tokenIndex === -1)
          result.push({
            mainNetwork,
            assetId,
            symbol,
            relayChain,
            precision: 0,
            tokenPriceJson: {} as TokenPriceJson,
            providers: purchaseProviders ?? [],
          });
      });

      return result;
    }, [] as any[])
    .map(
      ({ mainNetwork, tokenPriceJson, precision, assetId, symbol, relayChain, providers }) =>
        new CurrencyController(mainNetwork, assetId, symbol, tokenPriceJson, precision, providers, relayChain)
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
  return currencies.map(({ token, tokenId, relayChain }) => {
    const tokenUpper = token.toUpperCase();
    const filteredOptions = currencies.filter(({ token: _token }) => _token === token);
    const label = filteredOptions.length > 1 ? `${tokenUpper} (${relayChain.toUpperCase()})` : tokenUpper;

    return {
      label,
      value: tokenId,
    };
  });
}

export { getCurrencyOptions, getProviderUrl, defaultSortingCurrencies, getMockCurrencies };
