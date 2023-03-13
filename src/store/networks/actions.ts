import axios from 'axios';
import type { KeySettings } from '@/networks';
import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { LoadJsons, LoadHistory, SubscribeToBalances, ToggleActiveNode, AugmentedActionContext } from '@/store';
import type { FiatJson, AssetJson, NetworkJson, Networks, ApiOptions } from '@/interfaces';
import { MutationTypes } from '@/store/networks/mutations';
import BaseApi from '@/util/BaseApi';
import settingsNetworks from '@/networks';
import { ETHEREUM_NETWORKS, NOT_SUPPORTED_SUBQUERY_NETWORKS } from '@/consts/networks';
import { loadHistory } from '@/subquery/history';
import { getAddressMetaTyped, getReplacedMetaTyped } from '@/helpers/common';
import { getMockCurrencies } from '@/helpers/currencies';
import { connectToApi, subscribeAssetsBalances } from '@/helpers/networksConnection';
import { accountController } from '@/controllers/accountController';
import { AUTO_UPDATE_ASSETS_PRICE_MS } from '@/consts/global';
import { getTokenPrice } from '@/helpers/coingecko';

export enum ActionTypes {
  LOAD_JSONS = 'LOAD_JSONS',
  LOAD_HISTORY = 'LOAD_HISTORY',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.LOAD_JSONS](store: AugmentedActionContext, props: LoadJsons): Promise<void>;
  [ActionTypes.LOAD_HISTORY](store: AugmentedActionContext, props: LoadHistory): Promise<void>;
  [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const PAGE_SIZE = 100;

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_JSONS]({ commit, state: { fiats } }, { fiatsUrl }) {
    if (fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(fiatsUrl);

      commit(MutationTypes.SET_FIATS_JSON, { fiats });
    }
  },

  async [ActionTypes.LOAD_HISTORY]({ commit, getters }, { networkName, walletAddress, pageSize = PAGE_SIZE, assetId }) {
    if (NOT_SUPPORTED_SUBQUERY_NETWORKS.includes(networkName)) return; // Subquery does not work for these networks

    const {
      externalApi: { history: historyApi },
    } = getters.getNetwork(networkName);

    if (!historyApi) return;

    const cursor = null;
    const { type, url } = historyApi;
    const formattedAddress = BaseApi.formatAddress(
      { address: walletAddress, ethereumAddress: walletAddress },
      networkName
    );

    // const historyForNetwork = getters.getHistory(networkName);
    // const cursor = historyForNetwork?.[walletAddress]?.pageInfo.endCursor ?? null;

    if (type !== 'subquery' || url === '') return;

    try {
      const history = await loadHistory(url, formattedAddress, pageSize, cursor);

      commit(MutationTypes.SET_HISTORY, {
        networkName,
        walletAddress,
        history,
        isPreviously: cursor === null,
        assetId,
      });
    } catch {
      console.info(`%c failed to load history for ${networkName}`, 'background:orange;color:#fff');
    }
  },

  async [ActionTypes.TOGGLE_ACTIVE_NODE]({ state }, { network, nodeUrl, nodeName, oldNodeUrl }) {
    const networkApi = state.networks.find(({ name }) => name === network)!;

    if (networkApi.status !== 'disconnected' && nodeUrl === undefined) return;
    else if (nodeUrl === oldNodeUrl) {
      accountController.setActiveNode({ name: nodeName!, url: nodeUrl! }, network);

      return;
    }

    await networkApi.provider?.disconnect();

    const nodeOptions = nodeName && nodeUrl ? { name: nodeName, url: nodeUrl } : undefined;
    const apiOptions: ApiOptions = {
      apiRetry: 0,
      nodeIndex: 0,
    };

    connectToApi(networkApi, apiOptions, nodeOptions);
  },
};

export default actions;
