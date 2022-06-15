import { MutationTree } from 'vuex';
import {
  UpdateCurrencyProps,
  SetNetworksStatusProps,
  SetAssetsProps,
  SetTokensPriceProps,
  SetSubscriptionsBalancesProps,
  SetCurrenciesProps,
  SetAllNetworksIsLoaded,
  SetHistoryProps,
} from './types';
import { State } from './state';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS = 'SET_ASSETS',
  SET_TOKENS_PRICE = 'SET_TOKENS_PRICE',
  UPDATE_CURRENCY = 'UPDATE_CURRENCY',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ALL_NETWORKS_IS_LOADED = 'SET_ALL_NETWORKS_IS_LOADED',
  SET_SUBSCRIPTIONS_BALANCES = 'SET_SUBSCRIPTIONS_BALANCES',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS](state: State, props: SetAssetsProps): void;
  [MutationTypes.SET_TOKENS_PRICE](state: State, props: SetTokensPriceProps): void;
  [MutationTypes.UPDATE_CURRENCY](state: State, props: UpdateCurrencyProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state: State, props: SetAllNetworksIsLoaded): void;
  [MutationTypes.SET_SUBSCRIPTIONS_BALANCES](state: State, props: SetSubscriptionsBalancesProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },
  [MutationTypes.SET_ASSETS](state, { assets }) {
    state.assets = assets;
  },
  [MutationTypes.SET_TOKENS_PRICE](state, { tokensPrice }) {
    state.tokensPrice = tokensPrice;
  },
  [MutationTypes.UPDATE_CURRENCY](state, { walletAddress, currency }) {
    const { currencies } = state;
    const currenciesForAddress = [...(currencies[walletAddress] ?? [])];
    const currencyIndex = currenciesForAddress.findIndex(({ mainNetwork }) => mainNetwork === currency.mainNetwork);

    if (currencyIndex === -1) {
      currenciesForAddress.push(currency);
    } else {
      currenciesForAddress.splice(currencyIndex, 1, currency);
    }

    state.currencies = {
      ...currencies,
      [walletAddress]: currenciesForAddress,
    };
  },
  [MutationTypes.SET_CURRENCIES](state, { currencies }) {
    state.currencies = { ...state.currencies, ...currencies };
  },
  [MutationTypes.SET_HISTORY](state, { history: { nodes, pageInfo }, networkName, walletAddress }) {
    const oldHistoryForWalletAddress = state.history[networkName]?.[walletAddress];
    const startCursor = oldHistoryForWalletAddress?.pageInfo?.startCursor || pageInfo?.startCursor;
    const endCursor = pageInfo?.endCursor;

    const newHistoryForWalletAddress = {
      nodes: [...(oldHistoryForWalletAddress?.nodes ?? []), ...(nodes ?? [])],
      pageInfo: {
        startCursor,
        endCursor,
      },
    };

    const historyForNetwork = { ...(state.history[networkName] ?? []), [walletAddress]: newHistoryForWalletAddress };

    state.history = { ...state.history, [networkName]: historyForNetwork };
  },
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state, { value }) {
    state.allNetworksIsLoaded = value;
  },
  [MutationTypes.SET_SUBSCRIPTIONS_BALANCES](state, { subscriptionsBalances, networkName, walletAddress }) {
    state.networks = state.networks.map((network) => {
      return network.name === networkName
        ? {
            ...network,
            subscriptionsBalances: { ...network.subscriptionsBalances, [walletAddress]: subscriptionsBalances },
          }
        : network;
    });
  },
};

export default mutations;
