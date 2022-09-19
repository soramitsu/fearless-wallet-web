import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  UpdateCurrencyProps,
  SetNetworksStatusProps,
  UpdateCurrencyBalanceProps,
  SetAssetsProps,
  SetFiatsProps,
  SetTokensPriceProps,
  SetCurrenciesProps,
  SetAllNetworksIsLoaded,
  SetHistoryProps,
  SetNetworkActiveNodeProps,
  SetNetworkApi,
} from './types';
import { accountController } from '@/controllers/accountController';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS = 'SET_ASSETS',
  SET_FIATS = 'SET_FIATS',
  SET_TOKENS_PRICE = 'SET_TOKENS_PRICE',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ALL_NETWORKS_IS_LOADED = 'SET_ALL_NETWORKS_IS_LOADED',
  UPDATE_CURRENCY = 'UPDATE_CURRENCY',
  UPDATE_CURRENCY_BALANCE = 'UPDATE_CURRENCY_BALANCE',
  SET_NETWORK_ACTIVE_NODE = 'SET_NETWORK_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS](state: State, props: SetAssetsProps): void;
  [MutationTypes.SET_FIATS](state: State, props: SetFiatsProps): void;
  [MutationTypes.SET_TOKENS_PRICE](state: State, props: SetTokensPriceProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state: State, props: SetAllNetworksIsLoaded): void;
  [MutationTypes.UPDATE_CURRENCY](state: State, props: UpdateCurrencyProps): void;
  [MutationTypes.UPDATE_CURRENCY_BALANCE](state: State, props: UpdateCurrencyBalanceProps): void;
  [MutationTypes.SET_NETWORK_ACTIVE_NODE](state: State, props: SetNetworkActiveNodeProps): void;
  [MutationTypes.SET_NETWORK_API](state: State, props: SetNetworkApi): void;
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

  [MutationTypes.UPDATE_CURRENCY](state, { precision, selectedFiat, tokenId, tokensPrice }) {
    const { currencies } = state;
    const currentCurrency = currencies?.find(({ tokenId: savedTokenId }) => savedTokenId === tokenId)!; //eslint-disable-line

    currentCurrency.updateCurrency({ precision, tokensPrice, selectedFiat });
  },

  [MutationTypes.UPDATE_CURRENCY_BALANCE](state, { walletAddress, network, tokenId, balance }) {
    const { currencies } = state;
    const currentCurrency = currencies.find(({ tokenId: savedTokenId }) => savedTokenId === tokenId)!; //eslint-disable-line

    currentCurrency.updateCurrencyBalance({ walletAddress, network, balance });
  },

  [MutationTypes.SET_HISTORY](
    state,
    {
      history: {
        nodes,
        pageInfo: { startCursor: startCursorProp, endCursor: endCursorProp },
      },
      networkName,
      walletAddress,
      isPreviously,
    }
  ) {
    const oldHistoryForWalletAddress = state.history[networkName]?.[walletAddress];
    const oldPageInfo = oldHistoryForWalletAddress?.pageInfo;
    const oldStartCursor = oldPageInfo?.startCursor;
    const oldEndCursor = oldPageInfo?.endCursor;

    // loading history after sending tokens or teleporting tokens
    if (isPreviously && !!oldEndCursor) {
      const filteredNodes = nodes.filter(({ timestamp }) => {
        const oldNodes = oldHistoryForWalletAddress.nodes;
        const oldFirstTimespan = +oldNodes[0].timestamp ?? 0;

        return +timestamp > oldFirstTimespan;
      });

      if (filteredNodes.length === 0) return;

      const newHistoryForWalletAddress = {
        nodes: [...(filteredNodes ?? []), ...(oldHistoryForWalletAddress?.nodes ?? [])],
        pageInfo: {
          startCursor: startCursorProp,
          endCursor: oldEndCursor,
        },
      };

      const historyForNetwork = {
        ...state.history[networkName],
        [walletAddress]: newHistoryForWalletAddress,
      };

      state.history = { ...state.history, [networkName]: historyForNetwork };

      return;
    }

    // if this is first load or following one already saved
    const startCursor = oldStartCursor ?? startCursorProp;
    const newHistoryForWalletAddress = {
      nodes: [...(oldHistoryForWalletAddress?.nodes ?? []), ...(nodes ?? [])],
      pageInfo: {
        startCursor,
        endCursor: endCursorProp,
      },
    };

    const historyForNetwork = {
      ...(state.history[networkName] ?? []),
      [walletAddress]: newHistoryForWalletAddress,
    };

    state.history = { ...state.history, [networkName]: historyForNetwork };
  },

  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state, { value }) {
    state.allNetworksIsLoaded = value;
  },

  [MutationTypes.SET_NETWORK_ACTIVE_NODE](state, { network, name, url }) {
    const oldActiveNodes = state.activeNodes;

    accountController.setActiveNode({ name, url }, network);

    state.activeNodes = { ...oldActiveNodes, [network]: { name, url } };
  },

  [MutationTypes.SET_NETWORK_API](state, { network, provider, api }) {
    const networks = state.networks;
    const networkIndex = networks.findIndex(({ name }) => name === network)!; // eslint-disable-line

    networks[networkIndex].provider = provider;
    networks[networkIndex].api = api;

    state.networks = networks;
  },
};

export default mutations;
