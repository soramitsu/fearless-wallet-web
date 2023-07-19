import axios from 'axios';

import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { FetchHistory, AugmentedActionContext, ToggleFavorite } from '@/store';
import type { FiatJson, Network } from '@/interfaces';
import { MutationTypes } from '@/store/networks/mutations';
import BaseApi from '@/util/BaseApi';
import { fetchHistory } from '@/subquery/fetchingHistory';
import { URLS } from '@/consts/urls';
import { getUtilityAsset } from '@/helpers/currencies';
import { toggleFavoriteNetwork } from '@/extension/messaging';

export enum ActionTypes {
  FETCH_FIATS = 'FETCH_FIATS',
  FETCH_HISTORY = 'FETCH_HISTORY',
  TOGGLE_FAVORITE_NETWORK = 'TOGGLE_FAVORITE_NETWORK',
}

export type Actions = {
  [ActionTypes.FETCH_FIATS](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.FETCH_HISTORY](store: AugmentedActionContext, props: FetchHistory): Promise<void>;
  [ActionTypes.TOGGLE_FAVORITE_NETWORK](store: AugmentedActionContext, props: ToggleFavorite): boolean;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.FETCH_FIATS]({ commit, state: { fiats } }) {
    if (fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(URLS.FIATS);

      commit(MutationTypes.SET_FIATS_JSON, { fiats });
    }
  },

  async [ActionTypes.FETCH_HISTORY]({ commit, getters, rootState }, { networkName, wallet, assetId, isPreviously }) {
    const { externalApi } = getters.getNetwork(networkName) as Network;

    if (!externalApi || !externalApi.history) return;

    const { type, url } = externalApi.history;
    const formattedAddress = BaseApi.formatAddress(wallet, networkName);

    const { assetId: utilityAssetId } = getUtilityAsset(rootState.account.balances, networkName)!;

    // сейчас эндпоинт истории парсит только историю утилити токена
    // TODO: когда появится история других токенов отрефаткорить данную логику
    if (utilityAssetId !== assetId) return;

    const history = await fetchHistory(url, formattedAddress, type, networkName);

    if (history)
      commit(MutationTypes.SET_HISTORY, {
        networkName: networkName.toLowerCase(),
        walletAddress: wallet.address,
        history,
        isPreviously,
        assetId,
        serviceType: type,
      });
  },
  [ActionTypes.TOGGLE_FAVORITE_NETWORK]({ state, commit }, { address, networkName }): boolean {
    const index = state.networks.findIndex(({ name }) => name === networkName);
    const network = state.networks[index];
    const favoriteIndex = network.favorite.findIndex((el) => el === address);

    if (favoriteIndex !== -1) {
      commit(MutationTypes.REMOVE_FAVORITE_NETWORK, { index: favoriteIndex, networksName: networkName });
      toggleFavoriteNetwork(networkName);

      return false;
    }

    commit(MutationTypes.SET_FAVORITE_NETWORK, { address, networksName: networkName });

    toggleFavoriteNetwork(networkName);

    return true;
  },
};

export default actions;
