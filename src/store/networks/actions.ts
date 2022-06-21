import axios from 'axios';
import CurrencyController from '@/controllers/currencyController';
import NetworksController from '@/controllers/networksController';
import { ActionContext, ActionTree } from 'vuex';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Currency } from '@/interfaces/currencies';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { formatBalance } from '@/util/balances';
import { getHistory } from '@/sybquery/history';
import { getMockCurrencies } from '@/util/currenciesHelper';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Mutations, MutationTypes } from './mutations';
import { State } from './state';
import {
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
} from './types';
import type { AccountData } from '@polkadot/types/interfaces/balances';

export enum ActionTypes {
  LOAD_NETWORKS = 'LOAD_NETWORKS',
  LOAD_ASSETS_INFO = 'LOAD_ASSETS_INFO',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  LOAD_HISTORY = 'LOAD_HISTORY',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
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
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS]({ commit }, { url, autoConnectMs = 0 }) {
    const { data } = await axios.get(url);
    const networksJson: NetworkJson[] = data;

    const networks: Networks = networksJson.map(
      ({ nodes, name, assets, addressPrefix, externalApi: originalExternalApi }) => {
        const networkName = name.toLocaleLowerCase();
        const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
        const url = name === 'Calamari' ? nodes[1].url : nodes[0].url;
        const externalApi = originalExternalApi ?? ({} as ExternalApi);

        const provider = new WsProvider(url, autoConnectMs);
        const api = new ApiPromise({ provider });

        try {
          api.connect();

          // console.log(`%c${name.toUpperCase()}. API connection successful.`, 'background:green;color:#fff');
        } catch (ex) {
          api.disconnect();

          console.log(`%c${name.toUpperCase()}. Connection to api failed.`, 'background:red;color:#fff');
        }

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
    { dispatch, getters, commit, state: { networks, tokensPrice } },
    { accounts, loadHistory }
  ) {
    console.log('accounts', accounts);

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
                const formattedAddress =
                  type !== 'ethereum' ? NetworksController.formatAddress(walletAddress, networkName) : walletAddress;

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
                const balance = formatBalance(data as AccountData);

                const currency: Currency = new CurrencyController({
                  token,
                  mainNetwork: networkName,
                  price,
                  usd24HoursChange,
                  precision,
                  availableInNetworks: [
                    {
                      network: networkName,
                      balance,
                    },
                  ],
                });

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
            console.log(
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
};

export default actions;
