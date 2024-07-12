import type { MutationTree } from 'vuex';
import type { State } from './state';
import type {
  SetFiatsJsonProps,
  SetHistoryProps,
  History,
  SetNetworksStatusProps,
  SetAssetsPriceProps,
  SetNetworkFavoriteProps,
  RemoveNetworkFavoriteProps,
  SetSoraFee,
} from './types';
import { getFormattedHistory } from '@/helpers/history';
import { type AssetId, type SoraHistoryElement } from '@/interfaces';
import { isSora } from '@/helpers';
import { SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_FIATS_JSON = 'SET_FIATS_JSON',
  SET_ASSETS_PRICE = 'SET_ASSETS_PRICE',
  SET_HISTORY = 'SET_HISTORY',
  SET_FAVORITE_NETWORK = 'SET_FAVORITE_NETWORK',
  REMOVE_FAVORITE_NETWORK = 'REMOVE_FAVORITE_NETWORK',
  SET_SORA_FEES = 'SET_SORA_FEES',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, props: SetNetworksStatusProps): void;
  [MutationTypes.SET_FIATS_JSON](state: State, props: SetFiatsJsonProps): void;
  [MutationTypes.SET_ASSETS_PRICE](state: State, props: SetAssetsPriceProps): void;
  [MutationTypes.SET_HISTORY](state: State, props: SetHistoryProps): void;
  [MutationTypes.SET_FAVORITE_NETWORK](state: State, props: SetNetworkFavoriteProps): void;
  [MutationTypes.REMOVE_FAVORITE_NETWORK](state: State, props: RemoveNetworkFavoriteProps): void;
  [MutationTypes.SET_SORA_FEES](state: State, props: SetSoraFee): void;
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

  [MutationTypes.SET_HISTORY](state, { history, networkName, walletAddress, assetId, serviceType }) {
    const saveHistory = (assetId: AssetId, history: History) => {
      const { nodes, pageInfo } = getFormattedHistory(history, serviceType);
      const { startCursor: startCursorProp, endCursor: endCursorProp } = pageInfo;
      const oldHistory = state.history[assetId]?.[walletAddress]?.[networkName];
      const oldPageInfo = oldHistory?.pageInfo;
      const oldStartCursor = oldPageInfo?.startCursor;

      const historyForAssetId = {
        ...(state.history[assetId] ?? []),
        [walletAddress]: {
          ...(state.history[assetId]?.[walletAddress] ?? []),
          [networkName]: {
            timestamp: Date.now(),
            nodes,
            pageInfo: {
              startCursor: oldStartCursor ?? startCursorProp,
              endCursor: endCursorProp,
            },
          },
        },
      };

      state.history = { ...state.history, [assetId]: historyForAssetId };
    };

    if (serviceType === 'sora') {
      const typedHistory = history as SoraHistoryElement[];
      const historyAssets = typedHistory.reduce((result, item) => {
        const baseAssetId = item.data?.baseAssetId ?? item.data?.assetId;

        const networkJson = state.networks.find(({ name }) => isSora(name));
        const asset = networkJson?.assets.find(({ currencyId }) => currencyId === baseAssetId);
        const id = item.method === 'rewarded' ? SORA_VAL_ASSET_ID : asset?.id ?? SORA_XOR_ASSET_ID;

        if (result[id] === undefined) result[id] = [];

        result[id].push({
          ...item,
          success: item.execution.success,
        });

        return result;
      }, {} as Record<string, SoraHistoryElement[]>);

      Object.entries(historyAssets).forEach(([id, history]) => saveHistory(id, history));
    } else saveHistory(assetId, history);
  },

  [MutationTypes.SET_FAVORITE_NETWORK](state, { address, networksName }): void {
    const index = state.networks.findIndex((el) => el.name === networksName);
    const network = state.networks[index];

    network.favorite.push(address);
  },

  [MutationTypes.REMOVE_FAVORITE_NETWORK](state, { networksName, index }): void {
    const networkIndex = state.networks.findIndex((el) => el.name === networksName);
    const network = state.networks[networkIndex];

    network.favorite.splice(index, 1);
  },

  [MutationTypes.SET_SORA_FEES](state, { fees }): void {
    if (Object.values(fees).every((value) => value === '0')) return;

    state.soraFees = fees;
  },
};

export default mutations;
