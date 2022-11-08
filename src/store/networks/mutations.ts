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
  SetNetworkActiveNodeProps,
  SetNetworkApi,
} from './types';
import { accountController } from '@/controllers/accountController';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS_JSON = 'SET_ASSETS_JSON',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_ASSET_PRICE = 'SET_ASSET_PRICE',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SORT_CURRENCIES = 'SORT_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  UPDATE_CURRENCY_BALANCE = 'UPDATE_CURRENCY_BALANCE',
  SET_NETWORK_ACTIVE_NODE = 'SET_NETWORK_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS_JSON](state: State, props: SetAssetsJsonProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_ASSET_PRICE](state: State, props: SetAssetsPriceProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.UPDATE_CURRENCY_BALANCE](state: State, props: UpdateCurrencyBalanceProps): void;
  [MutationTypes.SET_NETWORK_ACTIVE_NODE](state: State, props: SetNetworkActiveNodeProps): void;
  [MutationTypes.SET_NETWORK_API](state: State, props: SetNetworkApi): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },

  [MutationTypes.SET_CURRENCIES](state, { currencies, address }) {
    if (address) {
      const sequence = currencies.map(({ assetId }) => assetId);

      accountController.setSequenceAssets(sequence, address);
    }

    state.currencies = currencies;
  },

  [MutationTypes.SET_ASSETS_JSON](state, { assetsJson }) {
    state.assetsJson = assetsJson;
  },

  [MutationTypes.SET_FIATS_JSON](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_ASSET_PRICE](state, { assetsPrice }) {
    state.assetsPrice = assetsPrice;

    state.currencies.forEach((currency) => currency.updatePrice());
  },

  [MutationTypes.UPDATE_CURRENCY_BALANCE](state, { walletAddress, network, assetId, balance, parentId, type }) {
    const { currencies, assetsJson, networks } = state;
    const { symbol, precision, existentialDeposit } = assetsJson.find(({ id }) => id === assetId)!;
    const relayChain = networks.find(({ chainId }) => chainId === parentId)?.name;

    const currentCurrency = currencies.find(({ assetId: _assetId, asset, relayChain: _relayChain }) => {
      const isExistingAssetId = _assetId === assetId;
      const isExistingSymbol = asset === symbol && _relayChain === relayChain;

      return isExistingAssetId || isExistingSymbol;
    })!;

    currentCurrency.updateCurrencyBalance({ walletAddress, network, balance, type, precision, existentialDeposit });
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

  [MutationTypes.SET_NETWORK_ACTIVE_NODE](state, { network, name, url }) {
    const oldActiveNodes = state.activeNodes;

    accountController.setActiveNode({ name, url }, network);

    state.activeNodes = { ...oldActiveNodes, [network]: { name, url } };
  },

  [MutationTypes.SET_NETWORK_API](state, { network, provider, api }) {
    const networks = state.networks;
    const networkIndex = networks.findIndex(({ name }) => name === network)!;

    networks[networkIndex].provider = provider;
    networks[networkIndex].api = api;

    state.networks = networks;
  },
};

export default mutations;
