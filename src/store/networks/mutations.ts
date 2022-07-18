import CurrencyController from '@/controllers/currencyController';
import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  UpdateCurrencyProps,
  SetNetworksStatusProps,
  SetAssetsProps,
  SetTokensPriceProps,
  SetSubscriptionsBalancesProps,
  SetCurrenciesProps,
  SetAllNetworksIsLoaded,
  SetHistoryProps,
  UpdateActiveNodeProps,
} from './types';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS = 'SET_ASSETS',
  SET_TOKENS_PRICE = 'SET_TOKENS_PRICE',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ALL_NETWORKS_IS_LOADED = 'SET_ALL_NETWORKS_IS_LOADED',
  SET_SUBSCRIPTIONS_BALANCES = 'SET_SUBSCRIPTIONS_BALANCES',
  UPDATE_CURRENCY = 'UPDATE_CURRENCY',
  UPDATE_ACTIVE_NODE = 'UPDATE_ACTIVE_NODE',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS](state: State, props: SetAssetsProps): void;
  [MutationTypes.SET_TOKENS_PRICE](state: State, props: SetTokensPriceProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state: State, props: SetAllNetworksIsLoaded): void;
  [MutationTypes.SET_SUBSCRIPTIONS_BALANCES](state: State, props: SetSubscriptionsBalancesProps): void;
  [MutationTypes.UPDATE_CURRENCY](state: State, props: UpdateCurrencyProps): void;
  [MutationTypes.UPDATE_ACTIVE_NODE](state: State, props: UpdateActiveNodeProps): void;
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
    const { availableInNetworks, mainNetwork, precision, price, token, usd24HoursChange } = currency;
    const { currencies } = state;
    const currenciesForAddress = [...(currencies[walletAddress] ?? [])];
    const currencyIndex = currenciesForAddress.findIndex(({ token: existToken }) => existToken === token);

    if (currencyIndex !== -1) {
      currenciesForAddress[currencyIndex].updateFields(currency);
    } else {
      const currency = new CurrencyController(
        mainNetwork,
        token,
        price,
        usd24HoursChange,
        precision,
        availableInNetworks
      );

      currenciesForAddress.push(currency);
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
  [MutationTypes.UPDATE_ACTIVE_NODE](state, { networkName, provider, api }) {
    const networks = state.networks;
    const networkIndex = networks.findIndex(({ name }) => name === networkName)!; // eslint-disable-line

    networks[networkIndex].provider = provider;
    networks[networkIndex].api = api;

    state.networks = networks;
  },
};

export default mutations;
