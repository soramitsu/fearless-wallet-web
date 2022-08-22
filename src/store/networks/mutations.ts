import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  UpdateCurrencyProps,
  SetNetworksStatusProps,
  UpdateCurrencyBalanceProps,
  SetAssetsProps,
  SetFiatsProps,
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
  SET_FIATS = 'SET_FIATS',
  SET_TOKENS_PRICE = 'SET_TOKENS_PRICE',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ALL_NETWORKS_IS_LOADED = 'SET_ALL_NETWORKS_IS_LOADED',
  SET_SUBSCRIPTIONS_BALANCES = 'SET_SUBSCRIPTIONS_BALANCES',
  UPDATE_CURRENCY = 'UPDATE_CURRENCY',
  UPDATE_CURRENCY_BALANCE = 'UPDATE_CURRENCY_BALANCE',
  UPDATE_ACTIVE_NODE = 'UPDATE_ACTIVE_NODE',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS](state: State, props: SetAssetsProps): void;
  [MutationTypes.SET_FIATS](state: State, props: SetFiatsProps): void;
  [MutationTypes.SET_TOKENS_PRICE](state: State, props: SetTokensPriceProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state: State, props: SetAllNetworksIsLoaded): void;
  [MutationTypes.SET_SUBSCRIPTIONS_BALANCES](state: State, props: SetSubscriptionsBalancesProps): void;
  [MutationTypes.UPDATE_CURRENCY](state: State, props: UpdateCurrencyProps): void;
  [MutationTypes.UPDATE_CURRENCY_BALANCE](state: State, props: UpdateCurrencyBalanceProps): void;
  [MutationTypes.UPDATE_ACTIVE_NODE](state: State, props: UpdateActiveNodeProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },

  [MutationTypes.SET_CURRENCIES](state, { currencies }) {
    state.currencies = currencies;
  },

  [MutationTypes.SET_ASSETS](state, { assets }) {
    state.assets = assets;
  },

  [MutationTypes.SET_FIATS](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_TOKENS_PRICE](state, { tokensPriceJson }) {
    state.tokensPriceJson = tokensPriceJson;
  },

  [MutationTypes.UPDATE_CURRENCY](state, currency) {
    const { token } = currency;
    const { currencies } = state;
    const currencyIndex = currencies?.findIndex(({ token: existToken }) => existToken === token);

    currencies[currencyIndex].updateCurrency(currency);
  },

  [MutationTypes.UPDATE_CURRENCY_BALANCE](state, { walletAddress, currency }) {
    const { token } = currency;
    const { currencies } = state;
    const currentCurrency = currencies.find(({ token: existToken }) => existToken === token)!; //eslint-disable-line

    currentCurrency.updateCurrencyBalance({ walletAddress, currency });
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
