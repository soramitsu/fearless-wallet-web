import axios from 'axios';
import { MutationTypes } from './mutations';
import type { Settings } from '@/networks';
import type { State } from './state';
import type { ActionTree } from 'vuex';
import type {
  LoadJsons,
  LoadHistory,
  SubscribeToBalances,
  ToggleActiveNode,
  Accounts,
  AugmentedActionContext,
} from './types';
import type { FiatJson } from '@/interfaces/common';
import type { AssetJson } from '@/interfaces/assets';
import type { NetworkJson, Networks, ExternalApi } from '@/interfaces/networks';
import type { TokensPrice } from '@/interfaces/tokens';
import BaseApi from '@/util/BaseApi';
import settingsNetworks from '@/networks';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { loadHistory } from '@/subquery/history';
import { getReplacedMetaTyped } from '@/helpers/common';
import { getMockCurrencies } from '@/helpers/currencies';
import { connectToApi, connectToNetworksApi, subscribeTokensBalances } from '@/helpers/networksConnection';
import { PAGE_SIZE } from '@/consts/history';

export enum ActionTypes {
  LOAD_JSONS = 'LOAD_JSONS',
  CONNECT_TO_NODES = 'CONNECT_TO_NODES',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.LOAD_JSONS](store: AugmentedActionContext, props: LoadJsons): Promise<void>;
  [ActionTypes.CONNECT_TO_NODES](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_TOKENS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_HISTORY](store: AugmentedActionContext, props: LoadHistory): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](store: AugmentedActionContext, props: SubscribeToBalances): Promise<void>;
  [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_JSONS]({ commit }, { chainsUrl, assetsUrl, fiatsUrl }) {
    const { data: chainsData } = await axios.get(chainsUrl);
    const { data: assetsData } = await axios.get(assetsUrl);
    const { data: fiatData } = await axios.get(fiatsUrl);
    const networksJson: NetworkJson[] = chainsData;

    const networks: Networks = networksJson.map(
      ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi, chainId, parentId, paraId }) => {
        const networkName = name.toLowerCase();
        const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
        const externalApi = originalExternalApi ?? ({} as ExternalApi);
        const settings = settingsNetworks[networkName as Settings] ?? {};

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
        };
      }
    );

    commit(MutationTypes.SET_ASSETS_JSON, { assetsJson: assetsData as AssetJson[] });
    commit(MutationTypes.SET_FIATS_JSON, { fiats: fiatData as FiatJson[] });
    commit(MutationTypes.SET_NETWORKS, { networks });
    commit(MutationTypes.SET_CURRENCIES, { currencies: getMockCurrencies(networks) });
  },

  async [ActionTypes.CONNECT_TO_NODES](context) {
    const { commit, state } = context;
    const networks = connectToNetworksApi(state.networks, context);

    commit(MutationTypes.SET_NETWORKS, { networks });
  },

  async [ActionTypes.LOAD_TOKENS_PRICE]({ commit, state: { assetsJson, fiats } }) {
    const urlFiatsPart = fiats.map(({ id }) => id).join('%2C');
    const urlsTokens = assetsJson.filter(({ priceId }) => !!priceId).map(({ priceId }) => priceId);
    const urlTokensPart = [...new Set(urlsTokens)].join('%2C');
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${urlFiatsPart}&include_24hr_change=true&ids=${urlTokensPart}`;

    try {
      const { data } = await axios.get(url);
      const typedData = data as TokensPrice;
      const tokensPrice = {} as TokensPrice;

      for (const priceId in typedData) {
        const assetIdS = assetsJson.filter(({ priceId: _priceId }) => _priceId === priceId);

        assetIdS.forEach(({ id }) => {
          tokensPrice[id] = data[priceId];
        });
      }

      commit(MutationTypes.SET_TOKENS_PRICE, { tokensPrice });
    } catch {
      console.info('coingecko request failed');
    }
  },

  async [ActionTypes.LOAD_HISTORY]({ commit, getters }, { networkName, walletAddress, pageSize = PAGE_SIZE, assetId }) {
    if (networkName === 'moonbase alpha') return;

    const { externalApi } = getters.getNetwork(networkName);
    const historyExternalApi = externalApi.history;

    if (!historyExternalApi) return;

    const formattedAddress = BaseApi.formatAddress(
      { address: walletAddress, ethereumAddress: walletAddress },
      networkName
    );
    const { type, url } = historyExternalApi;
    const cursor = null;

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
      console.info(`failed to load history for ${networkName}`);
    }
  },

  async [ActionTypes.SUBSCRIBE_TO_BALANCES](context, { accounts, networksProps }) {
    const { commit, state } = context;
    const { networks: networksStore } = state;

    commit(MutationTypes.SET_ALL_NETWORKS_IS_LOADED, {
      value: false,
    });

    // if the list of networks is not transferred, then we subscribe to all
    const networks = networksProps ?? networksStore;

    const promises = networks.map(async (network) => {
      const { isEthereumNetwork, name: networkName } = network;

      Object.entries(accounts).forEach(async ([walletAddress, { type: accountType, json }]) => {
        const { isReplacedAccount, replacedSettings } = getReplacedMetaTyped(json.meta);
        const replacedNetworksList = Object.values(replacedSettings ?? []).flat();

        // if it is a replaced account and the iterated network is not in the networksList
        if (isReplacedAccount && !replacedNetworksList.includes(networkName)) return;

        // ethereum accounts only subscribe to the ethereum networks and
        // substrate accounts only subscribe to the substrate networks
        if ((!isEthereumNetwork && accountType === 'ethereum') || (isEthereumNetwork && accountType !== 'ethereum'))
          return;

        subscribeTokensBalances(context, walletAddress, network);
      });
    });

    await Promise.allSettled(promises);

    commit(MutationTypes.SET_ALL_NETWORKS_IS_LOADED, {
      value: true,
    });
  },

  async [ActionTypes.TOGGLE_ACTIVE_NODE](
    { state, commit, dispatch },
    { network, nodeName, nodeUrl: nodeUrlProp, oldNodeUrl }
  ) {
    const networks = state.networks;
    const networkApi = networks.find(({ name }) => name === network)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const nodeUrl = nodeUrlProp === '' ? networkApi.nodes[0].url : nodeUrlProp;

    commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
      network,
      name: nodeName,
      url: nodeUrlProp,
    });

    if (nodeUrl === oldNodeUrl || (oldNodeUrl === '' && nodeUrl === networkApi.nodes[0].url)) return;

    await networkApi.api!.disconnect(); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    await networkApi.provider!.disconnect(); // eslint-disable-line @typescript-eslint/no-non-null-assertion

    const { provider, api } = connectToApi(network, nodeUrl, 0);

    commit(MutationTypes.SET_NETWORK_API, { network, provider, api });

    const accounts = BaseApi.getAccounts().reduce((result, { address, meta }) => {
      const { type } = BaseApi.getPair(address);

      result[address] = { type, json: { address, meta } };

      return result;
    }, {} as Accounts);

    await dispatch(ActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, loadHistory: false, networksProps: [networkApi] });
  },
};

export default actions;
