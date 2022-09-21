import { BN } from '@polkadot/util';
import type { Currencies, Currency } from '@/interfaces/currencies';
import type { TokenPriceJson } from '@/interfaces/tokens';
import type { Networks } from '@/interfaces/networks';
import type { Wallet } from '@/store/accounts/types';
import type { RelayChainName } from '@/consts/teleport';
import CurrencyController from '@/controllers/currencyController';
import NetworksController from '@/controllers/networksController';

type CurrencyMock = {
  mainNetwork: string;
  assetId: string;
  symbol: string;
  displayName?: string;
  relayChain: RelayChainName;
  tokenPriceJson: TokenPriceJson;
  providers: string[];
};

function getMockCurrencies(networks: Networks): Currencies {
  const assets = NetworksController.getAssets();

  const currencies = networks
    .reduce((result, network) => {
      const { assets: networkAssets, name: mainNetwork, parentId } = network;
      const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNetwork) as RelayChainName;

      networkAssets.forEach(({ assetId, purchaseProviders, isUtility }) => {
        const { symbol, displayName: _displayName } = assets.find(({ id }) => id === assetId)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
        const displayName = _displayName ?? symbol;
        const currencyIndex = result.findIndex(
          ({ assetId: _assetId, relayChain: _relayChain, displayName: _displayName }) => {
            const isExistingTokenId = _assetId === assetId;
            const isExistingDisplayName = _displayName === displayName;
            const isExistingToken = isExistingDisplayName && _relayChain === relayChain;

            return isExistingTokenId || isExistingToken;
          }
        );

        if (currencyIndex === -1) {
          const newCurrency = {
            mainNetwork: isUtility ? mainNetwork : '',
            assetId: assetId,
            symbol,
            displayName: displayName ?? symbol,
            relayChain,
            tokenPriceJson: {} as TokenPriceJson,
            providers: purchaseProviders ?? [],
          };

          result.push(newCurrency);
        } else if (isUtility && result[currencyIndex].mainNetwork === '') {
          result[currencyIndex].mainNetwork = mainNetwork;
        }
      });

      return result;
    }, [] as CurrencyMock[])
    .map(
      ({ mainNetwork, tokenPriceJson, assetId, symbol, relayChain, providers, displayName }) =>
        new CurrencyController(mainNetwork, assetId, symbol, displayName, tokenPriceJson, providers, relayChain)
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
  return currencies.map(({ tokenId, relayChain, displayName }) => {
    const tokenUpper = displayName.toUpperCase();
    const filteredOptions = currencies.filter(({ displayName: _displayName }) => _displayName === displayName);
    const label = filteredOptions.length > 1 ? `${tokenUpper} (${relayChain.toUpperCase()})` : tokenUpper;

    return {
      label,
      value: tokenId,
    };
  });
}

function getParams(isParaTeleport: boolean, recipientParaId: number, accountId32: string | Uint8Array, amount: string) {
  return [
    {
      V1: isParaTeleport
        ? {
            interior: 'Here',
            parents: 1,
          }
        : {
            interior: {
              X1: {
                ParaChain: recipientParaId,
              },
            },
            parents: 0,
          },
    },
    {
      V1: {
        interior: {
          X1: {
            AccountId32: {
              id: accountId32,
              network: 'Any',
            },
          },
        },
        parents: 0,
      },
    },
    {
      V1: [
        {
          fun: {
            Fungible: new BN(amount),
          },
          id: {
            Concrete: {
              interior: 'Here',
              parents: isParaTeleport ? 1 : 0,
            },
          },
        },
      ],
    },
    0,
    { Unlimited: null },
  ];
}

export { getCurrencyOptions, getProviderUrl, defaultSortingCurrencies, getMockCurrencies, getParams };
