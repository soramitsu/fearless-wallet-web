import axios from 'axios';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { MutationTypes } from './mutations';
import type { Mutations } from './mutations';
import type { Settings } from '@/networks';
import type { State } from './state';
import type { ActionContext, ActionTree } from 'vuex';
import type {
  NetworkJson,
  Networks,
  AssetJson,
  FiatJson,
  LoadNetworks,
  LoadHistory,
  SubscribeToBalances,
  LoadAssets,
  LoadFiats,
  TokensPriceJson,
  ExternalApi,
  UpdateActiveNode,
  Accounts,
} from './types';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import BaseApi from '@/util/BaseApi';
import settingsNetworks from '@/networks';
import { accountController } from '@/controllers/accountController';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { formatBalance } from '@/util/balances';
import { getHistory } from '@/subquery/history';
import { getReplacedMetaTyped } from '@/util/helpers';
import { getMockCurrencies } from '@/util/currenciesHelper';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

export enum ActionTypes {
  LOAD_NETWORKS = 'LOAD_NETWORKS',
  LOAD_ASSETS = 'LOAD_ASSETS',
  LOAD_FIATS = 'LOAD_FIATS',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  UPDATE_ACTIVE_NODE = 'UPDATE_ACTIVE_NODE',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type Actions = {
  [ActionTypes.LOAD_NETWORKS](store: AugmentedActionContext, props: LoadNetworks): Promise<void>;
  [ActionTypes.LOAD_ASSETS](store: AugmentedActionContext, props: LoadAssets): Promise<void>;
  [ActionTypes.LOAD_FIATS](store: AugmentedActionContext, props: LoadFiats): Promise<void>;
  [ActionTypes.LOAD_TOKENS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.LOAD_HISTORY](store: AugmentedActionContext, props: LoadHistory): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](store: AugmentedActionContext, props: SubscribeToBalances): Promise<void>;
  [ActionTypes.UPDATE_ACTIVE_NODE](store: AugmentedActionContext, props: UpdateActiveNode): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS]({ commit }, { url, autoConnectMs = 0 }) {
    const { data } = await axios.get(url);
    const networksJson: NetworkJson[] = data;
    const autoSelectNodes = accountController.getAutoSelectNodesValue();
    const activeNodes = accountController.getActiveNodes();

    const networks: Networks = networksJson.map(
      ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi, chainId }) => {
        const networkName = name.toLocaleLowerCase();
        const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
        const externalApi = originalExternalApi ?? ({} as ExternalApi);
        const autoSelectNode = autoSelectNodes[networkName] ?? true;
        const url = autoSelectNode ? nodes[0].url : activeNodes[networkName].url;
        const settings = settingsNetworks[networkName as Settings] ?? {};

        const { api, provider } = connectToApi(name, url, autoConnectMs);

        return {
          name: networkName,
          provider,
          api,
          nodes,
          assets,
          chainId,
          addressPrefix,
          isEthereumNetwork,
          subscriptionsBalances: {},
          externalApi,
          settings,
        };
      }
    );

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

  async [ActionTypes.LOAD_HISTORY](context, { historyExternalApi, walletAddress }) {
    const mockHistory = {};
    const pageSize = 20;
    const cursor = null;

    if (!historyExternalApi) return mockHistory;

    const { type, url } = historyExternalApi;

    if (type !== 'subquery' || url === '') return mockHistory;

    const history = await getHistory(url, pageSize, cursor, walletAddress);

    return history ?? mockHistory;
  },

  async [ActionTypes.SUBSCRIBE_TO_BALANCES](context, { accounts, loadHistory, networksProps }) {
    const { commit, state } = context;
    const { networks: networksStore } = state;

    commit(MutationTypes.SET_ALL_NETWORKS_IS_LOADED, {
      value: false,
    });

    // if the list of networks is not transferred, then we subscribe to all
    const networks = networksProps ?? networksStore;
    const promises = networks.map(async (network) => {
      const { api, subscriptionsBalances, isEthereumNetwork, name: networkName, assets, externalApi } = network;
      const token = assets[0]?.assetId;

      await api.isReadyOrError;

      try {
        Object.entries(accounts).forEach(async ([walletAddress, { type, json }]) => {
          const { isReplacedAccount, replacedSettings } = getReplacedMetaTyped(json.meta);
          const networksList = Object.values(replacedSettings ?? []).flat();

          // if it is a replaced account and the iterated network is not in the list
          if (isReplacedAccount && !networksList.includes(networkName)) return;

          // ethereum accounts only subscribe to the ethereum networks and
          // substrate accounts only subscribe to the substrate networks
          if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

          // unsubscribing from previous subscriptions(case when we added a new wallet)
          subscriptionsBalances?.[walletAddress]?.unsubscribe();

          if (loadHistory && networkName !== 'moonbase alpha')
            saveHistory(walletAddress, networkName, externalApi, context);

          const unsubscribe = subscribe(context, api, token, networkName, walletAddress);

          commit(MutationTypes.SET_SUBSCRIPTIONS_BALANCES, {
            networkName,
            walletAddress,
            subscriptionsBalances: unsubscribe,
          });
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

  async [ActionTypes.UPDATE_ACTIVE_NODE](
    { state, commit, dispatch },
    { networkName, nodeUrl: nodeUrlProp, oldNodeUrl }
  ) {
    const networks = state.networks;
    const network = networks.find(({ name }) => name === networkName)!; // eslint-disable-line
    const nodeUrl = nodeUrlProp === '' ? network.nodes[0].url : nodeUrlProp;

    if (nodeUrl === oldNodeUrl || (oldNodeUrl === '' && nodeUrl === network.nodes[0].url)) return;

    network.api.disconnect();
    network.provider.disconnect();

    const { provider, api } = connectToApi(networkName, nodeUrl, 0);

    commit(MutationTypes.UPDATE_ACTIVE_NODE, {
      networkName,
      provider,
      api,
    });

    const accounts = BaseApi.getAccounts().reduce((result, { address, meta }) => {
      const { type } = BaseApi.getPair(address);

      result[address] = { type, json: { address, meta } };

      return result;
    }, {} as Accounts);

    await dispatch(ActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, loadHistory: false, networksProps: [network] });
  },
};

export function connectToApi(name: string, url: string, autoConnectMs = 0) {
  const provider = new WsProvider(url, autoConnectMs);
  const api = new ApiPromise({ provider });

  try {
    api.connect();

    // console.info(`%c${name.toUpperCase()}. API connection successful.`, 'background:green;color:#fff');
  } catch (ex) {
    // api.disconnect();

    console.info(`%c${name.toUpperCase()}. Connection to api failed.`, 'background:red;color:#fff');
  }

  return { provider, api };
}

async function saveHistory(address: string, network: string, api: ExternalApi, context: AugmentedActionContext) {
  const { commit, dispatch } = context;
  const formattedAddress = BaseApi.formatAddress({ address, ethereumAddress: address }, network);

  const history = await dispatch(ActionTypes.LOAD_HISTORY, {
    historyExternalApi: api.history,
    walletAddress: formattedAddress,
  });

  commit(MutationTypes.SET_HISTORY, {
    networkName: network,
    walletAddress: address,
    history,
  });
}

function subscribe(context: AugmentedActionContext, api: ApiPromise, token: string, network: string, address: string) {
  const { getters, commit, state, rootState } = context;
  const { tokensPriceJson } = state;
  const tokensPrice = tokensPriceJson[token] ?? {};
  const precision = getters[NetworksGettersTypes.getAssets].find((kek: any) => kek.id === token)?.precision ?? 0;
  const selectedFiat = rootState.account.selectedFiat;

  commit(MutationTypes.UPDATE_CURRENCY, {
    token,
    tokensPrice,
    precision,
    selectedFiat,
  });

  const unsubscribe = api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);

    const currency = {
      network,
      token,
      balance,
    };

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      currency,
    });
  });

  return unsubscribe;
}

export default actions;
