import axios from 'axios';
import type { KeySettings } from '@/networks';
import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { LoadJsons, LoadHistory, SubscribeToBalances, ToggleActiveNode, AugmentedActionContext } from '@/store';
import type { FiatJson, AssetJson, NetworkJson, Networks, AssetsPrice, ApiOptions } from '@/interfaces';
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

export enum ActionTypes {
  LOAD_JSONS = 'LOAD_JSONS',
  CONNECT_TO_NODES = 'CONNECT_TO_NODES',
  LOAD_ASSETS_PRICE = 'LOAD_ASSETS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.LOAD_JSONS](store: AugmentedActionContext, props: LoadJsons): Promise<void>;
  [ActionTypes.CONNECT_TO_NODES](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_ASSETS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_HISTORY](store: AugmentedActionContext, props: LoadHistory): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](store: AugmentedActionContext, props: SubscribeToBalances): Promise<void>;
  [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const PAGE_SIZE = 100;

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_JSONS](
    { commit, state: { assetsJson, fiats, networks } },
    { chainsUrl, assetsUrl, fiatsUrl }
  ) {
    if (assetsJson.length === 0) {
      const { data: assetsJson } = await axios.get<AssetJson[]>(assetsUrl);

      commit(MutationTypes.SET_ASSETS_JSON, { assetsJson });
    }

    if (fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(fiatsUrl);

      commit(MutationTypes.SET_FIATS_JSON, { fiats });
    }

    if (networks.length === 0) {
      const { data: networksJson } = await axios.get<NetworkJson[]>(chainsUrl);

      const networks: Networks = networksJson.map(
        ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi, chainId, parentId, paraId }) => {
          const networkName = name.toLowerCase();
          const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
          const externalApi = originalExternalApi ?? {};
          const settings = settingsNetworks[networkName as KeySettings] ?? {};

          return {
            name: networkName,
            nodes,
            assets,
            chainId,
            parentId,
            paraId,
            addressPrefix,
            isEthereumNetwork,
            externalApi,
            settings,
            api: undefined,
            provider: undefined,
            status: 'pending',
          };
        }
      );

      commit(MutationTypes.SET_NETWORKS, { networks });
      commit(MutationTypes.SET_CURRENCIES, { currencies: getMockCurrencies(networks) });
    }
  },

  async [ActionTypes.CONNECT_TO_NODES](context) {
    context.state.networks.forEach((network, index) => {
      if (network.api?.isConnected) return;

      const timeout = (index / 5) * 1000;
      const apiOptions: ApiOptions = {
        apiRetry: 0,
        nodeIndex: 0,
      };

      setTimeout(() => connectToApi(network, apiOptions), timeout);
    });
  },

  async [ActionTypes.LOAD_ASSETS_PRICE]({ commit, state: { assetsJson, fiats } }) {
    const urlFiatsPart = fiats.map(({ id }) => id).join('%2C');
    const urlsAssets = assetsJson.filter(({ priceId }) => !!priceId).map(({ priceId }) => priceId);
    const urlAssetsPart = [...new Set(urlsAssets)].join('%2C');
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${urlFiatsPart}&include_24hr_change=true&ids=${urlAssetsPart}`;

    const loadAssetsPrice = async () => {
      try {
        const { data } = await axios.get<AssetsPrice>(url);
        const assetsPrice: AssetsPrice = {};

        for (const priceId in data) {
          assetsJson
            .filter(({ priceId: _priceId }) => _priceId === priceId)
            .forEach(({ displayName, symbol }) => {
              assetsPrice[displayName ?? symbol] = data[priceId];
            });
        }

        commit(MutationTypes.SET_ASSETS_PRICE, { assetsPrice });
      } catch {
        console.info('%c Coingecko request failed', 'background:red;color:#fff');
      }
    };

    const interval = setInterval(loadAssetsPrice, AUTO_UPDATE_ASSETS_PRICE_MS);

    commit(MutationTypes.SET_ASSETS_PRICE_INTERVAL, { interval });

    loadAssetsPrice();
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

  async [ActionTypes.SUBSCRIBE_TO_BALANCES]({ state }, { accounts, networksProps }) {
    // if the list of networks is not transferred, then we subscribe to all

    const networks = networksProps ?? state.networks;
    const promises = networks.map(async (network) => {
      const { isEthereumNetwork, name: networkName } = network;

      Object.entries(accounts).forEach(([walletAddress, { type: accountType, json }]) => {
        const { isReplacedAccount, replacedSettings } = getReplacedMetaTyped(json.meta);
        const replacedNetworksList = Object.values(replacedSettings ?? []).flat();
        // if it is a replaced account and the iterated network is not in the networksList
        if (isReplacedAccount && !replacedNetworksList.includes(networkName)) return;

        const { isMobile, ethereumAddress } = getAddressMetaTyped(json.meta);

        if (!isMobile) {
          const isEthereumAccountType = accountType === 'ethereum';

          // ethereum accounts only subscribe to the ethereum networks and
          // substrate accounts only subscribe to the substrate network
          if ((!isEthereumNetwork && isEthereumAccountType) || (isEthereumNetwork && !isEthereumAccountType)) return;
        }

        //subscribe only if mobile wallet have eth address and it's eth network
        if (isMobile && ethereumAddress && isEthereumNetwork) {
          subscribeAssetsBalances(ethereumAddress, network);

          return;
        }

        subscribeAssetsBalances(walletAddress, network);
      });
    });

    await Promise.allSettled(promises);
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
