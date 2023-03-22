import type { ISubmittableResult } from '@polkadot/api/node_modules/@polkadot/types/types/extrinsic';
import type { Currencies, Currency, Networks, RelayChainName, Balances, NetworkName } from '@/interfaces';
import type { Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { CurrencyController, NetworksController } from '@/controllers';
import { MAIN_NETWORKS } from '@/consts/networks';
import { MOCK_FP_BALANCE } from '@/consts/currencies';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';

type CurrencyMock = {
  mainNetwork: string;
  assetId: string;
  assetFullName: string;
  symbol: string;
  displayName: string;
  relayChain: RelayChainName;
  icon: string;
  providers: string[];
  balances: Balances;
};

function getMockCurrencies(networks: Networks): Currencies {
  const assetsJson = NetworksController.getAssetsJson();

  const currencies = networks
    .reduce<CurrencyMock[]>((result, network) => {
      const { assets: networkAssets, name: mainNet, parentId, isEthereumNetwork, icon } = network;
      const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;

      networkAssets.forEach(({ assetId, purchaseProviders, isUtility, isNative, type }) => {
        const {
          symbol,
          name,
          displayName: _displayName,
          precision,
          existentialDeposit,
        } = assetsJson.find(({ id }) => id === assetId)!;
        const displayName = _displayName ?? symbol;
        const mainNetwork = MAIN_NETWORKS[displayName] ?? mainNet;
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
            assetFullName: name,
            symbol,
            displayName,
            relayChain,
            icon,
            providers: purchaseProviders ?? [],
            balances: [],
          };

          result.push(newCurrency);
        } else if (isUtility || isNative) {
          result[currencyIndex].mainNetwork = mainNetwork;
          result[currencyIndex].assetId = assetId;
        }

        // Add mock balances
        const index = currencyIndex === -1 ? result.length - 1 : currencyIndex;
        const balances: Balances = [
          ...result[index].balances,
          {
            network: mainNet,
            existentialDeposit,
            type: type ?? 'native',
            precision,
            balance: {},
            assetId,
          },
        ];

        balances.forEach(({ balance }) => {
          BaseApi.getAccounts().forEach(({ address }) => {
            const isEthereumAccountType = BaseApi.getPair(address).type === 'ethereum';

            if ((isEthereumNetwork && isEthereumAccountType) || (!isEthereumNetwork && !isEthereumAccountType))
              balance[address] = MOCK_FP_BALANCE;
          });
        });

        result[index].balances = balances;
      });

      return result;
    }, [])
    .map(
      ({ mainNetwork, assetId, symbol, relayChain, providers, displayName, balances, icon, assetFullName }) =>
        new CurrencyController(
          mainNetwork,
          assetId,
          assetFullName,
          symbol,
          providers,
          relayChain,
          balances,
          icon,
          displayName
        )
    );

  return currencies;
}

function defaultSortingCurrencies(currencies: Currency[], wallet: Wallet, network?: NetworkName) {
  const relayChains = [];
  const currenciesWithAssets = currencies.filter((currency) => currency.getTotalCountAssets(wallet, network) !== '0');
  const currenciesWithoutAssets = currencies.filter(
    (currency) => currency.getTotalCountAssets(wallet, network) === '0'
  );

  const dotIndex = currenciesWithoutAssets.findIndex(({ displayName }) => displayName === 'dot');
  const ksmIndex = currenciesWithoutAssets.findIndex(({ displayName }) => displayName === 'ksm');

  if (dotIndex !== -1) {
    const dot = currenciesWithoutAssets.splice(dotIndex, 1)[0];

    relayChains.push(dot);
  }

  if (ksmIndex !== -1) {
    const ksm = currenciesWithoutAssets.splice(ksmIndex, 1)[0];

    relayChains.push(ksm);
  }

  currenciesWithAssets.sort((currency1, currency2) => {
    const totalBalanceOne = +currency1.getTransferableFiatBalance(wallet, network);
    const totalBalanceTwo = +currency2.getTransferableFiatBalance(wallet, network);

    return totalBalanceTwo - totalBalanceOne;
  });

  currenciesWithoutAssets.sort(({ asset: asset1 }, { asset: asset2 }) => asset1.localeCompare(asset2));

  return [...currenciesWithAssets, ...relayChains, ...currenciesWithoutAssets];
}

function getProviderUrl(name: 'moonpay' | 'ramp', asset: string, address: string) {
  const { MOONPAY, RAMP } = BASE_URLS_PREFIX;

  const provider = {
    moonpay: `${MOONPAY}/?apiKey=${MOONPAY_API_KEY}&currencyCode=${asset.toLowerCase()}&walletAddress=${address}&showWalletAddressForm=true`,
    ramp: `${RAMP}/?swapAsset=${asset.toUpperCase()}&userAddress=${address}&hostApiKey=${RAMP_API_KEY}`,
  };

  return provider[name];
}

function getCurrencyOptions(currencies: Currencies) {
  return currencies.map(({ assetId, relayChain, displayName }) => {
    const assetUpper = displayName.toUpperCase();
    const filteredOptions = currencies.filter(({ displayName: _displayName }) => _displayName === displayName);
    const label = filteredOptions.length > 1 ? `${assetUpper} (${relayChain.toUpperCase()})` : assetUpper;

    return {
      label,
      value: assetId,
      path: assetId,
      relayChain,
    };
  });
}

function getUtilityAsset(currencies: Currencies, _network: NetworkName): string {
  const currency = currencies.find(({ balances }) =>
    balances.some(({ network, type }) => network === _network && (type === 'native' || type === 'equilibrium'))
  )!;

  return currency.displayName;
}

function statusLogging(callback: () => void) {
  return (result: ISubmittableResult) => {
    const { status } = result;

    if (status.isBroadcast) {
      console.info(`Successful transfer with hash ${status.asBroadcast.toString()}`);

      callback();
    }
  };
}

export {
  getCurrencyOptions,
  getProviderUrl,
  defaultSortingCurrencies,
  getMockCurrencies,
  getUtilityAsset,
  statusLogging,
};
