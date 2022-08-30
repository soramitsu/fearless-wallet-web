import type { Currencies, Currency } from '@/interfaces/currencies';
import type { Networks, TokenPriceJson } from '@/store/networks/types';
import type { Wallet } from '@/store/accounts/types';
import CurrencyController from '@/controllers/currencyController';

export function getMockCurrencies(networks: Networks): Currencies {
  const currencies: Currencies = networks
    .reduce((result, network) => {
      const { assets, name } = network;
      const token = assets[0]?.assetId;
      const tokenIndex = result.findIndex(({ token: tokenExist }) => tokenExist === token);

      if (tokenIndex === -1)
        result.push({
          mainNetwork: name,
          token,
          precision: 0,
          tokenPriceJson: {} as TokenPriceJson,
        });

      return result;
    }, [] as any[])
    .map(
      ({ mainNetwork, tokenPriceJson, precision, token }) =>
        new CurrencyController(mainNetwork, token, tokenPriceJson, precision)
    );

  return currencies;
}

export function defaultSortingCurrencies(currencies: Currency[], wallet: Wallet) {
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
