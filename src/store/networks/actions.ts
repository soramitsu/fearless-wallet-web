import axios from 'axios';
import { MutationTypes } from './mutations';
import type { Settings } from '@/networks';
import type { State } from './state';
import type { ActionTree } from 'vuex';
import type {
  LoadNetworks,
  LoadHistory,
  SubscribeToBalances,
  LoadAssets,
  LoadFiats,
  ToggleActiveNode,
  Accounts,
  AugmentedActionContext,
} from './types';
import type { FiatJson } from '@/interfaces/common';
import type { AssetJson } from '@/interfaces/assets';
import type { NetworkJson, DisconnectNetworks, ExternalApi } from '@/interfaces/networks';
import type { TokensPriceJson } from '@/interfaces/tokens';
import BaseApi from '@/util/BaseApi';
import settingsNetworks from '@/networks';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { loadHistory } from '@/subquery/history';
import { getReplacedMetaTyped } from '@/util/helpers';
import { getMockCurrencies } from '@/util/currenciesHelper';
import { connectToApi, connectToNetworksApi, subscribeToBalances } from '@/util/networksAndAssetsHelpers';
import { PAGE_SIZE } from '@/consts/history';

export enum ActionTypes {
  LOAD_NETWORKS = 'LOAD_NETWORKS',
  LOAD_ASSETS = 'LOAD_ASSETS',
  LOAD_FIATS = 'LOAD_FIATS',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  TOGGLE_ACTIVE_NODE = 'TOGGLE_ACTIVE_NODE',
}

export type Actions = {
  [ActionTypes.LOAD_NETWORKS](store: AugmentedActionContext, props: LoadNetworks): Promise<void>;
  [ActionTypes.LOAD_ASSETS](store: AugmentedActionContext, props: LoadAssets): Promise<void>;
  [ActionTypes.LOAD_FIATS](store: AugmentedActionContext, props: LoadFiats): Promise<void>;
  [ActionTypes.LOAD_TOKENS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_HISTORY](store: AugmentedActionContext, props: LoadHistory): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](store: AugmentedActionContext, props: SubscribeToBalances): Promise<void>;
  [ActionTypes.TOGGLE_ACTIVE_NODE](store: AugmentedActionContext, props: ToggleActiveNode): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS](context, { url, autoConnectMs = 0 }) {
    const { commit } = context;
    const { data } = await axios.get(url);
    const networksJson: NetworkJson[] = data;

    const disconnectNetworks: DisconnectNetworks = networksJson.map(
      ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi, chainId, parentId }) => {
        const networkName = name.toLocaleLowerCase();
        const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
        const externalApi = originalExternalApi ?? ({} as ExternalApi);
        const settings = settingsNetworks[networkName as Settings] ?? {};

        return {
          name: networkName,
          nodes,
          assets,
          chainId,
          parentId,
          addressPrefix,
          isEthereumNetwork,
          externalApi,
          settings,
        };
      }
    );

    const networks = connectToNetworksApi(disconnectNetworks, autoConnectMs, context);
    const currencies = getMockCurrencies(networks);

    commit(MutationTypes.SET_CURRENCIES, { currencies });
    commit(MutationTypes.SET_NETWORKS, { networks });
  },

  async [ActionTypes.LOAD_ASSETS]({ commit }, { url }) {
    const { data } = await axios.get(url);
    const assetsJson: AssetJson[] = data;

    commit(MutationTypes.SET_ASSETS, { assets: assetsJson });
  },

  async [ActionTypes.LOAD_FIATS]({ commit }, { url }) {
    const { data } = await axios.get(url);
    const fiatsJson: FiatJson[] = data;

    commit(MutationTypes.SET_FIATS, { fiats: fiatsJson });
  },

  async [ActionTypes.LOAD_TOKENS_PRICE]({ commit, state: { networks, assets, fiats } }) {
    const assetsIds = networks.map(({ assets }) => assets[0].assetId);
    const urlFiatsPart = fiats.map(({ id }) => id).join('%2C');
    const urlTokensPart = assets
      .filter(({ priceId, id }) => assetsIds.includes(id) && !!priceId)
      .map(({ priceId }) => priceId)
      .join('%2C');
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${urlFiatsPart}&include_24hr_change=true&ids=${urlTokensPart}`;
    const { data } = await axios.get(url);
    const tokensPriceJson: TokensPriceJson = data;
    const tokensPrice: TokensPriceJson = {};

    for (const network in tokensPriceJson) {
      const assetId = assets.find(({ priceId }) => priceId === network)!.id;

      tokensPrice[assetId] = tokensPriceJson[network];
    }

    commit(MutationTypes.SET_TOKENS_PRICE, { tokensPriceJson: tokensPrice });
  },

  async [ActionTypes.LOAD_HISTORY]({ commit, getters }, { networkName, walletAddress, pageSize = PAGE_SIZE }) {
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

    const history = await loadHistory(url, formattedAddress, pageSize, cursor);

    commit(MutationTypes.SET_HISTORY, {
      networkName,
      walletAddress,
      history,
      isPreviously: cursor === null,
    });
  },

  async [ActionTypes.SUBSCRIBE_TO_BALANCES](context, { accounts, networksProps }) {
    console.info('accounts', accounts);

    const { commit, state } = context;
    const { networks: networksStore } = state;

    commit(MutationTypes.SET_ALL_NETWORKS_IS_LOADED, {
      value: false,
    });

    // if the list of networks is not transferred, then we subscribe to all
    const networks = networksProps ?? networksStore;

    const promises = networks.map(async (network) => {
      const { api, isEthereumNetwork, name: networkName, assets: networkAssets } = network;
      const utilityTokenId = networkAssets.find(({ isUtility }) => isUtility)!.assetId; // eslint-disable-line

      await api.isReadyOrError;

      try {
        Object.entries(accounts).forEach(async ([walletAddress, { type, json }]) => {
          const { isReplacedAccount, replacedSettings } = getReplacedMetaTyped(json.meta);
          const networksList = Object.values(replacedSettings ?? []).flat();

          // if it is a replaced account and the iterated network is not in the networksList
          if (isReplacedAccount && !networksList.includes(networkName)) return;

          // ethereum accounts only subscribe to the ethereum networks and
          // substrate accounts only subscribe to the substrate networks
          if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

          subscribeToBalances(context, api, utilityTokenId, networkName, walletAddress);
        });
      } catch (ex) {
        console.info(
          `
            Subscribe to ${networkName.toUpperCase()} failed
            ${ex}
          `
        );
      }
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
    const networkApi = networks.find(({ name }) => name === network)!; // eslint-disable-line
    const nodeUrl = nodeUrlProp === '' ? networkApi.nodes[0].url : nodeUrlProp;

    commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
      network,
      name: nodeName,
      url: nodeUrlProp,
    });

    if (nodeUrl === oldNodeUrl || (oldNodeUrl === '' && nodeUrl === networkApi.nodes[0].url)) return;

    await networkApi.api.disconnect();
    await networkApi.provider.disconnect();

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
