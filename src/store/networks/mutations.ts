import { FPNumber, api as apiSora } from '@sora-substrate/util';
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
  SetSoraFee,
  UpdateXorTotalBalanceProps,
  SetTotalXorSubscribeProps,
} from './types';
import type { SoraFees } from '@/interfaces';
import { accountController } from '@/controllers';
import { isSora } from '@/helpers/common';
import { getFormattedHistory } from '@/helpers/history';
import { getCurrency, getXORCurrency } from '@/helpers/currencies';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_ASSETS_JSON = 'SET_ASSETS_JSON',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_ASSETS_PRICE = 'SET_ASSETS_PRICE',
  SET_ASSETS_PRICE_INTERVAL = 'SET_ASSETS_PRICE_INTERVAL',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SORT_CURRENCIES = 'SORT_CURRENCIES',
  SET_HISTORY = 'SET_HISTORY',
  UPDATE_CURRENCY_BALANCE = 'UPDATE_CURRENCY_BALANCE',
  UPDATE_XOR_TOTAL_BALANCE = 'UPDATE_XOR_TOTAL_BALANCE',
  SET_TOTAL_XOR_SUBSCRIBE = 'SET_TOTAL_XOR_SUBSCRIBE',
  SET_ACTIVE_NODE = 'SET_ACTIVE_NODE',
  SET_NETWORK_API = 'SET_NETWORK_API',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
  SET_SORA_FEE = 'SET_SORA_FEE',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_ASSETS_JSON](state: State, props: SetAssetsJsonProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_ASSETS_PRICE](state: State, props: SetAssetsPriceProps): void;
  [MutationTypes.SET_ASSETS_PRICE_INTERVAL](state: State, props: SetAssetsPriceIntervalProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, props: SetCurrenciesProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.UPDATE_CURRENCY_BALANCE](state: State, props: UpdateCurrencyBalanceProps): void;
  [MutationTypes.UPDATE_XOR_TOTAL_BALANCE](state: State, props: UpdateXorTotalBalanceProps): void;
  [MutationTypes.SET_TOTAL_XOR_SUBSCRIBE](state: State, props: SetTotalXorSubscribeProps): void;
  [MutationTypes.SET_ACTIVE_NODE](state: State, props: SetActiveNodeProps): void;
  [MutationTypes.SET_NETWORK_API](state: State, props: SetNetworkApiProps): void;
  [MutationTypes.SET_NETWORK_STATUS](state: State, props: SetNetworkStatusProps): void;
  [MutationTypes.SET_SORA_FEE](state: State): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },

  [MutationTypes.SET_CURRENCIES](state, { currencies, address, network }) {
    if (address && network) {
      if (Array.isArray(currencies)) {
        const sequence = currencies.map(({ assetId }) => assetId);

        accountController.setSequenceAssets(sequence, address, network);
      } else {
        const entries = Object.entries(currencies).map(([network, currencies]) => {
          const sequence = currencies.map(({ assetId }) => assetId).join();

          return [network, sequence];
        });

        accountController.setSequenceAssets(Object.fromEntries(entries), address);
      }
    }

    state.currencies = Array.isArray(currencies) ? currencies : currencies[network!];
  },

  [MutationTypes.SET_ASSETS_JSON](state, { assetsJson }) {
    state.assetsJson = assetsJson;
  },

  [MutationTypes.SET_FIATS_JSON](state, { fiats }) {
    state.fiats = fiats.map((fiat) => ({ ...fiat }));
  },

  [MutationTypes.SET_ASSETS_PRICE](state, { assetsPrice }) {
    state.assetsPrice = assetsPrice;

    state.currencies.forEach((currency) => currency.updatePrice());
  },

  [MutationTypes.SET_ASSETS_PRICE_INTERVAL](state, { interval }) {
    state.assetsPriceInterval = interval;
  },

  [MutationTypes.UPDATE_CURRENCY_BALANCE](state, props) {
    const { walletAddress, network, balance } = props;

    const currentCurrency = getCurrency(state, props);

    currentCurrency.updateCurrencyBalance({ walletAddress, network, balance });
  },

  [MutationTypes.UPDATE_XOR_TOTAL_BALANCE]({ currencies }, { walletAddress, xorTotalBalance }) {
    const currencyXOR = getXORCurrency(currencies);

    currencyXOR.updateXorTotalBalance(walletAddress, xorTotalBalance);
  },

  [MutationTypes.SET_TOTAL_XOR_SUBSCRIBE](state, { subscription }) {
    state.totalXorSubscription?.unsubscribe();
    state.totalXorSubscription = subscription;
  },

  [MutationTypes.SET_HISTORY](state, props) {
    const { history, networkName, walletAddress, isPreviously, assetId, serviceType, isMock } = props;
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

  [MutationTypes.SET_SORA_FEE](state) {
    const fees = Object.fromEntries(
      Object.entries(apiSora.NetworkFee).map(([key, value]) => [key, FPNumber.fromCodecValue(value)])
    ) as SoraFees;
    const soraIndex = state.networks.findIndex(({ name }) => isSora(name))!;
    const newSoraItem = { ...state.networks[soraIndex], fees };

    state.networks.splice(soraIndex, 1, newSoraItem);
  },
};

export default mutations;
