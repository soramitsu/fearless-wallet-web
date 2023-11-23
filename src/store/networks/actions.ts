import axios from 'axios';
import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { FetchHistory, AugmentedNetworksContext, ToggleFavorite } from '@/store';
import type { FiatJson, Network } from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import { MutationTypes } from '@/store/networks/mutations';
import BaseApi from '@/util/BaseApi';
import { fetchHistory } from '@/subquery/fetchingHistory';
import { URLS } from '@/consts/urls';
import { getUtilityAsset } from '@/helpers/currencies';
import { toggleFavoriteNetwork } from '@/extension/messaging';
import { isRequireEvmAPI } from '@/extension/background/extension-base/src/background/utils/utils';
import { isSora } from '@/helpers';

export enum ActionTypes {
  FETCH_FIATS = 'FETCH_FIATS',
  FETCH_HISTORY = 'FETCH_HISTORY',
  TOGGLE_FAVORITE_NETWORK = 'TOGGLE_FAVORITE_NETWORK',
}

export type Actions = {
  [ActionTypes.FETCH_FIATS](store: AugmentedNetworksContext): Promise<void>;
  [ActionTypes.FETCH_HISTORY](store: AugmentedNetworksContext, props: FetchHistory): Promise<void>;
  [ActionTypes.TOGGLE_FAVORITE_NETWORK](store: AugmentedNetworksContext, props: ToggleFavorite): Promise<boolean>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.FETCH_FIATS]({ commit, state: { fiats } }) {
    if (fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(URLS.FIATS);

      commit(MutationTypes.SET_FIATS_JSON, { fiats });
    }
  },

  async [ActionTypes.FETCH_HISTORY]({ commit, getters, rootState, rootGetters }, { networkName, assetId, address }) {
    const { externalApi } = getters.getNetwork(networkName) as Network;
    const wallet = address ? { address, ethereumAddress: address } : rootGetters.selectedWallet;
    const formattedAddress = BaseApi.formatAddress(wallet, networkName);

    // TODO staking обновить, когда обновят json
    if (isSora(networkName)) {
      const { url } = externalApi.staking!;
      const history = await fetchHistory(url, formattedAddress, 'sora', networkName, assetId, false);

      if (history)
        commit(MutationTypes.SET_HISTORY, {
          networkName: networkName.toLowerCase(),
          walletAddress: BaseApi.formatAddress(wallet),
          history,
          assetId,
          serviceType: 'sora',
        });

      return;
    }

    if (!externalApi || !externalApi.history) return;

    const { type, url } = externalApi.history;
    const isNativeEvm = isRequireEvmAPI(networkName);
    const balances: TokenBalance[] = rootState.account.balances;
    const asset = isNativeEvm
      ? balances.find((el) => el.balances.some((asset) => asset.id === assetId))!
      : getUtilityAsset(rootState.account.balances, networkName)!;

    const utilityId = isNativeEvm
      ? asset.balances.find((el) => el.name.toLowerCase() === networkName.toLowerCase() && el.isUtility)?.id
      : asset.assetId;
    const isUtility = isNativeEvm ? utilityId !== undefined : assetId === utilityId;

    // сейчас эндпоинт истории парсит только историю утилити токена
    // TODO: когда появится история других токенов отрефаткорить данную логику
    if (isUtility && type !== 'etherscan') return;

    const { id } = asset.balances.find(({ name }) => name.toLowerCase() === networkName.toLowerCase())!;
    const history = await fetchHistory(url, formattedAddress, type, networkName, id, isUtility);

    if (history)
      commit(MutationTypes.SET_HISTORY, {
        networkName: networkName.toLowerCase(),
        walletAddress: wallet.address,
        history,
        assetId,
        serviceType: type,
      });
  },

  async [ActionTypes.TOGGLE_FAVORITE_NETWORK]({ state, commit }, { address, networkName }): Promise<boolean> {
    const index = state.networks.findIndex(({ name }) => name === networkName);
    const network = state.networks[index];
    const favoriteIndex = network.favorite.findIndex((el) => el === address);
    const isFavorite = favoriteIndex !== -1;

    if (isFavorite) {
      commit(MutationTypes.REMOVE_FAVORITE_NETWORK, { index: favoriteIndex, networksName: networkName });
    } else {
      commit(MutationTypes.SET_FAVORITE_NETWORK, { address, networksName: networkName });
    }

    toggleFavoriteNetwork(networkName);

    return isFavorite;
  },
};

export default actions;
