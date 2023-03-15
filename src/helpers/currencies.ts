import { ISubmittableResult } from '@polkadot/types/types';
import type { Currencies, Networks, RelayChainName, Balances, NetworkName } from '@/interfaces';
import type { Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import CurrencyController from '@/controllers/currencyController';
import NetworksController from '@/controllers/networksController';
import { ALL_NETWORKS, MAIN_NETWORKS } from '@/consts/networks';
import { mockFPBalance } from '@/consts/currencies';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { APIItemState } from '@/extension/background/extension-base/src/api/evm/types/ether';

type CurrencyMock = {
  mainNetwork: string;
  assetId: string;
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
              balance[address] = mockFPBalance;
          });
        });

        result[index].balances = balances;
      });

      return result;
    }, [])
    .map(
      ({ mainNetwork, assetId, symbol, relayChain, providers, displayName, balances, icon }) =>
        new CurrencyController(mainNetwork, assetId, symbol, providers, relayChain, balances, icon, displayName)
    );

  return currencies;
}

export function getTotalBalanceInNetwork(token: TokenBalance, network: string) {
  return token.balances.find((el) => el.name.toLowerCase() === network.toLowerCase())?.total ?? 0;
}

export function getTotalBalance(token: TokenBalance, network = ALL_NETWORKS) {
  if (network !== ALL_NETWORKS) return getTotalBalanceInNetwork(token, network);
  let balance = 0;

  token.balances.forEach((network) => {
    if (network.state === APIItemState.READY && network.total) {
      balance += +network.total;
    }
  });

  return balance;
}

export function getTotalCountAssets(token: TokenBalance, network = ALL_NETWORKS): string {
  if (network && network !== ALL_NETWORKS) {
    const balance = token.balances.find((el) => el.name.toLowerCase() === network.toLowerCase())?.total ?? '0';

    return balance ?? '0';
  }

  return token.balances.find((balance) => balance.name.toLowerCase() === network.toLowerCase())?.total ?? '0';
}

function defaultSortingCurrencies(currencies: TokenBalance[], network?: NetworkName) {
  const currenciesWithAssets = currencies.filter((currency) =>
    currency.balances.some((balance) => balance.total !== '0')
  );

  const currenciesWithoutAssets = currencies.filter((currency) =>
    currency.balances.every((balance) => balance.total === '0')
  );

  currenciesWithAssets.sort((currency1, currency2) => {
    const totalBalanceOne = +getTotalBalance(currency1, network);
    const totalBalanceTwo = +getTotalBalance(currency2, network);

    return totalBalanceTwo - totalBalanceOne;
  });

  currenciesWithoutAssets.sort(({ name: asset1 }, { name: asset2 }) => asset1.localeCompare(asset2));

  return [...currenciesWithAssets, ...currenciesWithoutAssets];
}

export function getWalletTotalBalance(tokens: TokenBalance[]) {
  const balance = tokens.reduce((acc, curr) => {
    return acc + +getTotalBalance(curr);
  }, 0);

  return balance;
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

function getUtilityAsset(currencies: TokenBalance[], _network: NetworkName): string {
  const currency = currencies.find(({ balances }) =>
    balances.some(({ name, type }) => name === _network && (type === 'native' || type === 'equilibrium'))
  )!;

  return currency.name;
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
