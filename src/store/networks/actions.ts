import axios from 'axios';

import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { FetchHistory, AugmentedActionContext } from '@/store';
import type { FiatJson, Network } from '@/interfaces';
import { MutationTypes } from '@/store/networks/mutations';
import BaseApi from '@/util/BaseApi';
import { fetchHistory } from '@/subquery/fetchingHistory';
import { URLS } from '@/consts/urls';

export enum ActionTypes {
  FETCH_FIATS = 'FETCH_FIATS',
  CONNECT_TO_NODES = 'CONNECT_TO_NODES',
  FETCH_ASSETS_PRICE = 'FETCH_ASSETS_PRICE',
  FETCH_HISTORY = 'FETCH_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.FETCH_FIATS](store: AugmentedActionContext): Promise<void>;
  // [ActionTypes.FETCH_ASSETS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.FETCH_HISTORY](store: AugmentedActionContext, props: FetchHistory): Promise<void>;
  // [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.FETCH_FIATS]({ commit, state: { fiats } }) {
    if (fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(URLS.FIATS);

      commit(MutationTypes.SET_FIATS_JSON, { fiats });
    }
  },

  async [ActionTypes.FETCH_HISTORY]({ commit, getters }, { networkName, wallet, assetId, isPreviously }) {
    const { externalApi } = getters.getNetwork(networkName) as Network;

    if (!externalApi || !externalApi.history) return;

    const { type, url } = externalApi.history;
    const formattedAddress = BaseApi.formatAddress(wallet, networkName);

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

  // async [ActionTypes.TOGGLE_ACTIVE_NODE]({ state }, { network, nodeUrl, nodeName, oldNodeUrl }) {
  //   const networkApi = state.networks.find(({ name }) => name === network)!;

  //   if (networkApi.status !== 'disconnected' && nodeUrl === undefined) return;
  //   else if (nodeUrl === oldNodeUrl) {
  //     accountController.setActiveNode({ name: nodeName!, url: nodeUrl! }, network);

  //     return;
  //   }

  //   await networkApi.provider?.disconnect();

  //   const nodeOptions = nodeName && nodeUrl ? { name: nodeName, url: nodeUrl } : undefined;
  //   const apiOptions: ApiOptions = {
  //     apiRetry: 0,
  //     nodeIndex: 0,
  //   };

  //   connectToApi(networkApi, apiOptions, nodeOptions);
  // },
};

export default actions;
