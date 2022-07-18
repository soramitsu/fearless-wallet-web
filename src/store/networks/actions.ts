import axios from 'axios';
import keyring from '@polkadot/ui-keyring';
import NetworksController from '@/controllers/networksController';
import settingsNetworks from '@/networks';
import { accountController } from '@/controllers/accountController';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { formatBalance } from '@/util/balances';
import { getHistory } from '@/subquery/history';
import { getMockCurrencies } from '@/util/currenciesHelper';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Mutations, MutationTypes } from './mutations';
import type { Settings } from '@/networks';
import type { SelectedWallet } from '@/store/accounts/types';
import type { State } from './state';
import type { ActionContext, ActionTree } from 'vuex';
import type {
  NetworkJson,
  Networks,
  AssetsJson,
  LoadNetworksInfo,
  LoadHistory,
  SubscribeToBalances,
  LoadAssets,
  TokensPriceJson,
  TokensPrice,
  ExternalApi,
  UpdateActiveNode,
  Accounts,
} from './types';
import type { AccountData } from '@polkadot/types/interfaces/balances';

export enum ActionTypes {
  LOAD_NETWORKS = 'LOAD_NETWORKS',
  LOAD_ASSETS_INFO = 'LOAD_ASSETS_INFO',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
  UPDATE_ACTIVE_NODE = 'UPDATE_ACTIVE_NODE',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, State>, 'commit'>;

export type Actions = {
  [ActionTypes.LOAD_NETWORKS](store: AugmentedActionContext, props: LoadNetworksInfo): Promise<void>;
  [ActionTypes.LOAD_ASSETS_INFO](store: AugmentedActionContext, props: LoadAssets): Promise<void>;
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
      ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi }) => {
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
  async [ActionTypes.LOAD_ASSETS_INFO]({ commit }, { url }) {
    const { data } = await axios.get(url);
    const assetsJson: AssetsJson[] = data;

    commit(MutationTypes.SET_ASSETS, { assets: assetsJson });
  },
  async [ActionTypes.LOAD_TOKENS_PRICE]({ commit, state: { networks, assets } }) {
    const assetsIds = networks.map(({ assets }) => assets[0].assetId);
    const urlTokensPart = assets
      .filter(({ priceId, id }) => assetsIds.includes(id) && !!priceId)
      .map(({ priceId }) => priceId)
      .join('%2C');
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=${urlTokensPart}`;
    const { data } = await axios.get(url);
    const tokensPriceJson: TokensPriceJson = data;
    const tokensPrice: TokensPrice = {};

    for (const tokenPriceId in tokensPriceJson) {
      const { usd, usd_24h_change } = tokensPriceJson[tokenPriceId]; // eslint-disable-line
      const assetId = assets.find(({ priceId }) => priceId === tokenPriceId)!.id;

      tokensPrice[assetId] = {
        usd,
        usd24HoursChange: usd_24h_change,
      };
    }

    commit(MutationTypes.SET_TOKENS_PRICE, { tokensPrice });
  },
  async [ActionTypes.LOAD_HISTORY]({ commit }, { historyExternalApi, walletAddress }) {
    const mockHistory = {};
    const pageSize = 20;
    const cursor = null;

    if (!historyExternalApi) return mockHistory;

    const { type, url } = historyExternalApi;

    if (type !== 'subquery' || url === '') return mockHistory;

    const history = await getHistory(url, pageSize, cursor, walletAddress);

    return history ?? mockHistory;
  },
  async [ActionTypes.SUBSCRIBE_TO_BALANCES](
    { dispatch, getters, commit, state: { networks: networksStore, tokensPrice } },
    { accounts, loadHistory, networksProps }
  ) {
    console.info('accounts', accounts);

    commit(MutationTypes.SET_ALL_NETWORKS_IS_LOADED, {
      value: false,
    });

    // if the list of networks is not transferred, then we subscribe to all
    const networks = networksProps ?? networksStore;

    await Promise.allSettled(
      networks.map(
        async ({ api, subscriptionsBalances, isEthereumNetwork, name: networkName, assets, externalApi }) => {
          await api.isReadyOrError;

          try {
            Object.entries(accounts).forEach(async ([walletAddress, { type }]) => {
              // ethereum accounts only subscribe to the ethereum networks and
              // substrate accounts only subscribe to the substrate networks
              if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

              // unsubscribing from previous subscriptions(case when we added a new wallet)
              subscriptionsBalances?.[walletAddress]?.unsubscribe();

              if (loadHistory && networkName !== 'moonbase alpha') {
                const formattedAddress = NetworksController.formatAddress(
                  { address: walletAddress, ethereumAddress: walletAddress } as SelectedWallet,
                  networkName
                );

                const history = await dispatch(ActionTypes.LOAD_HISTORY, {
                  historyExternalApi: externalApi.history,
                  walletAddress: formattedAddress,
                });

                commit(MutationTypes.SET_HISTORY, {
                  networkName,
                  walletAddress,
                  history,
                });
              }

              const token = assets[0]?.assetId;
              const price = tokensPrice[token]?.usd ?? 0;
              const usd24HoursChange = tokensPrice[token]?.usd24HoursChange ?? 0;
              const precision =
                getters[NetworksGettersTypes.getAssetsInfo].find((kek: any) => kek.id === token)?.precision ?? 0;

              const unsubscribe = api.rx.query.system.account(walletAddress).subscribe(async (result) => {
                const data = (result as any).data;
                const balance = formatBalance(data as AccountData, precision);

                const currency = {
                  mainNetwork: networkName,
                  token,
                  price,
                  usd24HoursChange,
                  precision,
                  availableInNetworks: [
                    {
                      network: networkName,
                      balance,
                    },
                  ],
                };

                commit(MutationTypes.UPDATE_CURRENCY, {
                  walletAddress,
                  currency,
                });
              });

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
        }
      )
    );

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

    const accounts = keyring.getAccounts().reduce((result, { address }) => {
      const { type } = keyring.getPair(address);

      result[address] = { type };

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

export default actions;
