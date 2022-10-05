import type { Currencies, Currency, Networks, RelayChainName } from '@/interfaces';
import type { Wallet } from '@/store/accounts/types';
import CurrencyController from '@/controllers/currencyController';
import NetworksController from '@/controllers/networksController';
import { MAIN_NETWORKS } from '@/consts/networks';

type CurrencyMock = {
  mainNetwork: string;
  assetId: string;
  symbol: string;
  displayName?: string;
  relayChain: RelayChainName;
  providers: string[];
};

function getMockCurrencies(networks: Networks): Currencies {
  const assetsJson = NetworksController.getAssetsJson();

  const currencies = networks
    .reduce((result, network) => {
      const { assets: networkAssets, name: mainNet, parentId } = network;
      const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;

      networkAssets.forEach(({ assetId, purchaseProviders, isUtility, isNative }) => {
        const { symbol, displayName: _displayName } = assetsJson.find(({ id }) => id === assetId)!;
        const displayName = _displayName ?? symbol;
        const mainNetwork = MAIN_NETWORKS[symbol] ?? mainNet;
        const currencyIndex = result.findIndex(
          ({ assetId: _assetId, relayChain: _relayChain, displayName: _displayName }) => {
            const isExistingAssetId = _assetId === assetId;
            const isExistingDisplayName = _displayName === displayName;
            const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

            return isExistingAssetId || isExistingAsset;
          }
        );

        if (currencyIndex === -1) {
          const newCurrency = {
            mainNetwork,
            assetId,
            symbol,
            displayName: displayName ?? symbol,
            relayChain,
            providers: purchaseProviders ?? [],
          };

          result.push(newCurrency);
        } else if (isUtility || isNative) {
          result[currencyIndex].mainNetwork = mainNetwork;
          result[currencyIndex].assetId = assetId;
        }
      });

      return result;
    }, [] as CurrencyMock[])
    .map(
      ({ mainNetwork, assetId, symbol, relayChain, providers, displayName }) =>
        new CurrencyController(mainNetwork, assetId, symbol, displayName, providers, relayChain)
    );

  return currencies;
}

function defaultSortingCurrencies(currencies: Currency[], wallet: Wallet) {
  const relayChains = [];
  const currenciesWithAssets = currencies.filter((currency) => currency.getTotalCountAssets(wallet) !== '0');
  const currenciesWithoutAssets = currencies.filter((currency) => currency.getTotalCountAssets(wallet) === '0');

  const dotIndex = currenciesWithoutAssets.findIndex(({ asset }) => asset === 'dot');
  const ksmIndex = currenciesWithoutAssets.findIndex(({ asset }) => asset === 'ksm');

  if (dotIndex !== -1) {
    const dot = currenciesWithoutAssets.splice(dotIndex, 1)[0];

    relayChains.push(dot);
  }

  if (ksmIndex !== -1) {
    const ksm = currenciesWithoutAssets.splice(ksmIndex, 1)[0];

    relayChains.push(ksm);
  }

  currenciesWithAssets.sort((currency1, currency2) => {
    const totalBalanceOne = +currency1.getTotalBalance(wallet);
    const totalBalanceTwo = +currency2.getTotalBalance(wallet);

    return totalBalanceTwo - totalBalanceOne;
  });

  currenciesWithoutAssets.sort(({ asset: asset1 }, { asset: asset2 }) => asset1.localeCompare(asset2));

  return [...currenciesWithAssets, ...relayChains, ...currenciesWithoutAssets];
}

function getProviderUrl(providerName: string, asset: string, address: string) {
  switch (providerName) {
    case 'moonpay':
      return `https://buy.moonpay.com/?currencyCode=${asset}&walletAddress=${address}&showWalletAddressForm=true`;
    case 'ramp':
      return `https://buy.ramp.network/?swapAsset=${asset.toUpperCase()}&userAddress=${address}`;
    default:
      return '';
  }
}

function getCurrencyOptions(currencies: Currencies) {
  return currencies.map(({ assetId, relayChain, displayName }) => {
    const assetUpper = displayName.toUpperCase();
    const filteredOptions = currencies.filter(({ displayName: _displayName }) => _displayName === displayName);
    const label = filteredOptions.length > 1 ? `${assetUpper} (${relayChain.toUpperCase()})` : assetUpper;

    return {
      label,
      value: assetId,
    };
  });
}

export { getCurrencyOptions, getProviderUrl, defaultSortingCurrencies, getMockCurrencies };
