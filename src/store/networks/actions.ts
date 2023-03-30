import axios from 'axios';
import type { KeySettings } from '@/networks';
import type { State } from '@/store/networks/state';
import type { ActionTree } from 'vuex';
import type { FetchJsons, FetchHistory, SubscribeToBalances, ToggleActiveNode, AugmentedActionContext } from '@/store';
import type { FiatJson, AssetJson, NetworkJson, Networks, ApiOptions, Network } from '@/interfaces';
import { MutationTypes } from '@/store/networks/mutations';
import BaseApi from '@/util/BaseApi';
import settingsNetworks from '@/networks';
import { fetchHistory } from '@/subquery/fetchingHistory';
import { getAddressMetaTyped, getReplacedMetaTyped } from '@/helpers/common';
import { getMockCurrencies } from '@/helpers/currencies';
import { connectToApi, subscribeAssetsBalances } from '@/helpers/networksConnection';
import { accountController } from '@/controllers/accountController';
import { AUTO_UPDATE_ASSETS_PRICE_MS } from '@/consts/global';
import { getTokenPrice } from '@/helpers/coingecko';

export enum ActionTypes {
  FETCH_JSONS = 'FETCH_JSONS',
  CONNECT_TO_NODES = 'CONNECT_TO_NODES',
  FETCH_ASSETS_PRICE = 'FETCH_ASSETS_PRICE',
  FETCH_HISTORY = 'FETCH_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.FETCH_JSONS](store: AugmentedActionContext, props: FetchJsons): Promise<void>;
  [ActionTypes.CONNECT_TO_NODES](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.FETCH_ASSETS_PRICE](store: AugmentedActionContext, fiatName: string): Promise<void>;
  [ActionTypes.FETCH_HISTORY](store: AugmentedActionContext, props: FetchHistory): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](store: AugmentedActionContext, props: SubscribeToBalances): Promise<void>;
  [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.FETCH_JSONS](
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
        ({ nodes, name, assets, addressPrefix, icon, externalApi: originalExternalApi, chainId, parentId, paraId }) => {
          const networkName = name.toLowerCase();
          const isEthereumNetwork = BaseApi.isEthereumNetwork(networkName);
          const externalApi = originalExternalApi ?? {};
          const settings = settingsNetworks[networkName as KeySettings] ?? {};

          return {
            name: networkName,
            label: name,
            icon,
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

  async [ActionTypes.FETCH_ASSETS_PRICE]({ commit, state: { assetsJson }, rootState }, _fiatName) {
    const urlsAssets = assetsJson.filter(({ priceId }) => !!priceId).map(({ priceId }) => priceId);
    const fiatName = _fiatName ?? rootState.account.selectedFiat;

    const fetchAssetsPrice = async () => {
      try {
        const assetsPrice = await getTokenPrice([...new Set(urlsAssets as unknown as string)], fiatName, assetsJson);

        commit(MutationTypes.SET_ASSETS_PRICE, { assetsPrice });
      } catch {
        console.info('%c Coingecko request failed', 'background:red;color:#fff');
      }
    };

    const interval = setInterval(fetchAssetsPrice, AUTO_UPDATE_ASSETS_PRICE_MS);

    commit(MutationTypes.SET_ASSETS_PRICE_INTERVAL, { interval });

    await fetchAssetsPrice();
  },

  async [ActionTypes.FETCH_HISTORY]({ commit, getters }, { networkName, wallet, assetId, isPreviously }) {
    const {
      externalApi: { history: historyApi },
    } = getters.getNetwork(networkName) as Network;

    if (!historyApi) return;

    const { type, url } = historyApi;
    const formattedAddress = BaseApi.formatAddress(wallet, networkName);
    const history = await fetchHistory(url, formattedAddress, type, networkName);

    if (history)
      commit(MutationTypes.SET_HISTORY, {
        networkName,
        walletAddress: wallet.address,
        history,
        isPreviously,
        assetId,
        serviceType: type,
      });
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

    await networkApi.api?.disconnect();

    const nodeOptions = nodeName && nodeUrl ? { name: nodeName, url: nodeUrl } : undefined;
    const apiOptions: ApiOptions = {
      apiRetry: 0,
      nodeIndex: 0,
    };

    connectToApi(networkApi, apiOptions, nodeOptions);
  },
};

export default actions;
