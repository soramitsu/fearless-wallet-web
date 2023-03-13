import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  SetNetworksStatusProps,
  UpdateCurrencyBalanceProps,
  SetAssetsJsonProps,
  SetFiatsJsonProps,
  SetAssetsPriceProps,
  SetCurrenciesProps,
  SetHistoryProps,
  SetActiveNodeProps,
  SetNetworkApiProps,
  SetNetworkStatusProps,
  SetAssetsPriceIntervalProps,
} from './types';
import { accountController } from '@/controllers/accountController';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS_JSON = 'SET_ASSETS_JSON',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_ASSETS_PRICE = 'SET_ASSETS_PRICE',
  SET_ASSETS_PRICE_INTERVAL = 'SET_ASSETS_PRICE_INTERVAL',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SORT_CURRENCIES = 'SORT_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ACTIVE_NODE = 'SET_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS_JSON](state: State, props: SetAssetsJsonProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_ASSETS_PRICE_INTERVAL](state: State, props: SetAssetsPriceIntervalProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_ACTIVE_NODE](state: State, props: SetActiveNodeProps): void;
  [MutationTypes.SET_NETWORK_API](state: State, props: SetNetworkApiProps): void;
  [MutationTypes.SET_NETWORK_STATUS](state: State, props: SetNetworkStatusProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },

  [MutationTypes.SET_CURRENCIES](state, { currencies, address, network }) {
    if (address && network) {
      if (Array.isArray(currencies)) {
        const sequence = currencies.map(({ name }) => name);

        accountController.setSequenceAssets(sequence, address, network);
      }
    }

    state.currencies = currencies;
  },

  [MutationTypes.SET_ASSETS_JSON](state, { assetsJson }) {
    state.assetsJson = assetsJson;
  },

  [MutationTypes.SET_FIATS_JSON](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_ASSETS_PRICE_INTERVAL](state, { interval }) {
    state.assetsPriceInterval = interval;
  },

  [MutationTypes.SET_HISTORY](state, { history, networkName, walletAddress, isPreviously, assetId, isMock }) {
    const { nodes, pageInfo } = history;
    const { startCursor: startCursorProp, endCursor: endCursorProp } = pageInfo;
    const oldHistory = state.history[assetId]?.[walletAddress]?.[networkName];
    const oldPageInfo = oldHistory?.pageInfo;
    const oldStartCursor = oldPageInfo?.startCursor;
    const oldEndCursor = oldPageInfo?.endCursor;

    if (isMock) {
      const historyForAssetId = {
        ...(state.history[assetId] ?? []),
        [walletAddress]: {
          ...state.history[assetId]?.[walletAddress],
          [networkName]: {
            nodes: [...nodes, ...(oldHistory?.nodes ?? [])],
            pageInfo: {
              startCursor: oldStartCursor,
              endCursor: oldEndCursor,
            },
          },
        },
      };

      state.history = { ...state.history, [assetId]: historyForAssetId };

      return;
    }

    // loading history after sending assets or teleporting assets
    if (isPreviously && !!oldEndCursor) {
      const oldHistoryNodesWithoutMock = oldHistory?.nodes.filter(({ isMock }) => !isMock) ?? [];

      const filteredNodes = nodes.filter(({ timestamp }) => {
        const oldFirstTimespan = +oldHistoryNodesWithoutMock[0].timestamp ?? 0;

        return +timestamp > oldFirstTimespan;
      });

      if (filteredNodes.length === 0) return;

      const newHistoryForNetwork = {
        nodes: [...(filteredNodes ?? []), ...oldHistoryNodesWithoutMock],
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

    const newHistoryForNetwork = {
      nodes: [...(oldHistory?.nodes ?? []), ...(nodes ?? [])],
      pageInfo: {
        // if this is first load or following one already saved
        startCursor: oldStartCursor ?? startCursorProp,
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

  [MutationTypes.SET_ACTIVE_NODE](state, { network, name, url, saveNode }) {
    const oldActiveNodes = state.activeNodes;

    if (saveNode) accountController.setActiveNode({ name, url }, network);

    state.activeNodes = { ...oldActiveNodes, [network]: { name, url } };
  },

  [MutationTypes.SET_NETWORK_API](state, { network, provider, api }) {
    const networkIndex = state.networks.findIndex(({ name }) => name === network)!;

    state.networks[networkIndex].provider = provider;
    state.networks[networkIndex].api = api;
  },

  [MutationTypes.SET_NETWORK_STATUS](state, { network, status }) {
    const networkIndex = state.networks.findIndex(({ name }) => name === network)!;

    if (status === 'connected' || status === 'ready') {
      setTimeout(() => {
        state.networks[networkIndex].status = status;
      }, 3000);
    } else {
      state.networks[networkIndex].status = status;
    }
  },
};

export default mutations;
