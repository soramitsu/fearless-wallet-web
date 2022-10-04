import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  SetNetworksStatusProps,
  UpdateCurrencyBalanceProps,
  SetAssetsJsonProps,
  SetFiatsJsonProps,
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
  SET_ASSETS_JSON = 'SET_ASSETS_JSON',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_TOKENS_PRICE = 'SET_TOKENS_PRICE',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ALL_NETWORKS_IS_LOADED = 'SET_ALL_NETWORKS_IS_LOADED',
  UPDATE_CURRENCY_BALANCE = 'UPDATE_CURRENCY_BALANCE',
  SET_NETWORK_ACTIVE_NODE = 'SET_NETWORK_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS_JSON](state: State, props: SetAssetsJsonProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_TOKENS_PRICE](state: State, props: SetTokensPriceProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ALL_NETWORKS_IS_LOADED](state: State, props: SetAllNetworksIsLoaded): void;
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

  [MutationTypes.SET_ASSETS_JSON](state, { assetsJson }) {
    state.assetsJson = assetsJson;
  },

  [MutationTypes.SET_FIATS_JSON](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_TOKENS_PRICE](state, { tokensPrice }) {
    state.tokensPrice = tokensPrice;

    state.currencies.forEach((currency) => currency.updatePrice());
  },

  [MutationTypes.UPDATE_CURRENCY_BALANCE](state, { walletAddress, network, assetId, balance, parentId, type }) {
    const { currencies, assetsJson, networks } = state;
    const { symbol, precision } = assetsJson.find(({ id }) => id === assetId)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const relayChain = networks.find(({ chainId }) => chainId === parentId)?.name;

    const currentCurrency = currencies.find(({ tokenId: _tokenId, token: _token, relayChain: _relayChain }) => { //eslint-disable-line
      const isExistingTokenId = _tokenId === assetId;
      const isExistingTokenSymbol = _token === symbol && _relayChain === relayChain;

      return isExistingTokenId || isExistingTokenSymbol;
    })!;

    currentCurrency.updateCurrencyBalance({ walletAddress, network, balance, type, precision });
  },

  [MutationTypes.SET_HISTORY](state, { history, networkName, walletAddress, isPreviously, assetId }) {
    const { nodes, pageInfo } = history;
    const { startCursor: startCursorProp, endCursor: endCursorProp } = pageInfo;
    const oldHistory = state.history[assetId]?.[walletAddress]?.[networkName];
    const oldPageInfo = oldHistory?.pageInfo;
    const oldStartCursor = oldPageInfo?.startCursor;
    const oldEndCursor = oldPageInfo?.endCursor;

    // loading history after sending tokens or teleporting tokens
    if (isPreviously && !!oldEndCursor) {
      const filteredNodes = nodes.filter(({ timestamp }) => {
        const oldNodes = oldHistory.nodes;
        const oldFirstTimespan = +oldNodes[0].timestamp ?? 0;

        return +timestamp > oldFirstTimespan;
      });

      if (filteredNodes.length === 0) return;

      const newHistoryForNetwork = {
        nodes: [...(filteredNodes ?? []), ...(oldHistory?.nodes ?? [])],
        pageInfo: {
          startCursor: startCursorProp,
          endCursor: oldEndCursor,
        },
      };

      const historyForWalletAddress = {
        ...state.history[assetId]?.[walletAddress],
        [networkName]: newHistoryForNetwork,
      };

      const historyForAssetId = {
        ...(state.history[assetId] ?? []),
        [walletAddress]: historyForWalletAddress,
      };

      state.history = { ...state.history, [assetId]: historyForAssetId };

      return;
    }

    // if this is first load or following one already saved
    const startCursor = oldStartCursor ?? startCursorProp;
    const newHistoryForNetwork = {
      nodes: [...(oldHistory?.nodes ?? []), ...(nodes ?? [])],
      pageInfo: {
        startCursor,
        endCursor: endCursorProp,
      },
    };

    const historyForWalletAddress = {
      ...(state.history[assetId]?.[walletAddress] ?? []),
      [networkName]: newHistoryForNetwork,
    };

    const historyForAssetId = {
      ...(state.history[assetId] ?? []),
      [walletAddress]: historyForWalletAddress,
    };

    state.history = { ...state.history, [assetId]: historyForAssetId };
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
