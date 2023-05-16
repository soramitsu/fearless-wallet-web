import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetFiatsJsonProps, SetHistoryProps, SetNetworksStatusProps, SetAssetsPriceProps } from './types';
import { getFormattedHistory } from '@/helpers/history';
export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS_JSON = 'SET_ASSETS_JSON',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_ASSETS_PRICE = 'SET_ASSETS_PRICE',
  SET_ASSETS_PRICE_INTERVAL = 'SET_ASSETS_PRICE_INTERVAL',
  SORT_CURRENCIES = 'SORT_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  SET_ACTIVE_NODE = 'SET_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
  SET_SORA_FEE = 'SET_SORA_FEE',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_ASSETS_PRICE](state: State, props: SetAssetsPriceProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },

  [MutationTypes.SET_ASSETS_PRICE](state, price) {
    state.assetsPrice = { ...price };
  },

  [MutationTypes.SET_FIATS_JSON](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_HISTORY](
    state,
    { history, networkName, walletAddress, isPreviously, assetId, serviceType, isMock }
  ) {
    const { nodes, pageInfo } = getFormattedHistory(history, serviceType);
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

      const historyForAssetId = {
        ...(state.history[assetId] ?? []),
        [walletAddress]: {
          ...state.history[assetId]?.[walletAddress],
          [networkName]: {
            nodes: [...(filteredNodes ?? []), ...oldHistoryNodesWithoutMock],
            pageInfo: {
              startCursor: startCursorProp,
              endCursor: oldEndCursor,
            },
          },
        },
      };

      state.history = { ...state.history, [assetId]: historyForAssetId };

      return;
    }

    const historyForAssetId = {
      ...(state.history[assetId] ?? []),
      [walletAddress]: {
        ...(state.history[assetId]?.[walletAddress] ?? []),
        [networkName]: {
          nodes: [...(nodes ?? []), ...(oldHistory?.nodes ?? [])],
          pageInfo: {
            startCursor: oldStartCursor ?? startCursorProp,
            endCursor: endCursorProp,
          },
        },
      },
    };

    state.history = { ...state.history, [assetId]: historyForAssetId };
  },

  // [MutationTypes.SET_ACTIVE_NODE](state, { network, name, url, saveNode }) {
  //   const oldActiveNodes = state.activeNodes;

  //   if (saveNode) accountController.setActiveNode({ name, url }, network);

  //   state.activeNodes = { ...oldActiveNodes, [network]: { name, url } };
  // },

  // [MutationTypes.SET_NETWORK_API](state, { network, provider, api }) {
  //   const networkIndex = state.networks.findIndex(({ name }) => name === network)!;

  //   state.networks[networkIndex].provider = provider;
  //   state.networks[networkIndex].api = api;
  // },

  // [MutationTypes.SET_NETWORK_STATUS](state, { network, status }) {
  //   const networkIndex = state.networks.findIndex(({ name }) => name === network)!;

  //   if (status === 'connected' || status === 'ready') {
  //     setTimeout(() => {
  //       state.networks[networkIndex].apiStatus = status;
  //     }, 3000);
  //   } else {
  //     state.networks[networkIndex].apiStatus = status;
  //   }
  // },
};

export default mutations;
