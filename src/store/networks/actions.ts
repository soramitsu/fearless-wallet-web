import { ActionTree, ActionContext } from 'vuex';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { MutationTypes, Mutations } from './mutations';
import { NetworkJson, Networks, AssetsJson, LoadNetworksInfo, LoadAssets, TokensPriceJson, TokensPrice } from './types';
import { State } from './state';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { formatBalance } from '@/util/balances';
import { Currency, Currencies, MockCurrencies } from '@/interfaces/currencies';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';

export enum ActionTypes {
  LOAD_NETWORKS_INFO = 'LOAD_NETWORKS_INFO',
  LOAD_ASSETS_INFO = 'LOAD_ASSETS_INFO',
  LOAD_TOKENS_PRICE = 'LOAD_TOKENS_PRICE',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, State>, 'commit'>;

export type Actions = {
  [ActionTypes.LOAD_NETWORKS_INFO](
    store: AugmentedActionContext,
    { url, autoConnectMs }: LoadNetworksInfo
  ): Promise<void>;
  [ActionTypes.LOAD_ASSETS_INFO](store: AugmentedActionContext, { url }: LoadAssets): Promise<void>;
  [ActionTypes.LOAD_TOKENS_PRICE](store: AugmentedActionContext): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](
    store: AugmentedActionContext,
    { accounts }: Record<string, SubjectInfo>
  ): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS_INFO]({ commit }, { url, autoConnectMs = 0 }) {
    const response = await fetch(url);
    const networksJson: NetworkJson[] = await response.json();

    const networks: Networks = networksJson.map(({ nodes, name, assets, addressPrefix }) => {
      const networkName = name.toLocaleLowerCase();
      const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
      const url = name === 'Calamari' ? nodes[1].url : nodes[0].url;

      const provider = new WsProvider(url, autoConnectMs);
      const api = new ApiPromise({ provider });

      try {
        api.connect();

        console.log(`%c${name.toUpperCase()}. API connection successful.`, 'background:green;color:#fff');
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
      };
    });

    const currencies: Currencies = {};
    const { substrate, ethereum } = getMockCurrencies(networks);

    keyring.getAccounts().forEach(({ address }) => {
      const { type } = keyring.getPair(address);

      currencies[address] = type === 'ethereum' ? ethereum : substrate;
    });

    commit(MutationTypes.SET_CURRENCIES, { currencies });
    commit(MutationTypes.SET_NETWORKS, { networks });
  },
  async [ActionTypes.LOAD_ASSETS_INFO]({ commit }, { url }) {
    const response = await fetch(url);
    const assetsJson: AssetsJson[] = await response.json();

    commit(MutationTypes.SET_ASSETS, { assets: assetsJson });
  },
  async [ActionTypes.LOAD_TOKENS_PRICE]({ commit, state: { networks, assets } }) {
    const assetsIds = networks.map(({ assets }) => assets[0].assetId);
    const urlTokensPart = assets
      .filter(({ priceId, id }) => assetsIds.includes(id) && !!priceId)
      .map(({ priceId }) => priceId)
      .join('%2C');
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=${urlTokensPart}`;
    const response = await fetch(url);
    const tokensPriceJson: TokensPriceJson = await response.json();
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
  async [ActionTypes.SUBSCRIBE_TO_BALANCES]({ commit, state: { networks, tokensPrice } }, { accounts }) {
    console.log('accounts', accounts);

    networks.map(async ({ api, subscriptionsBalances, isEthereumNetwork, name: networkName, assets }) => {
      await api.isReadyOrError;

      try {
        Object.entries(accounts).forEach(([walletAddress, { type }]) => {
          // ethereum accounts only subscribe to the ethereum networks
          if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

          // unsubscribing from previous subscriptions(case when we added a new wallet)
          subscriptionsBalances?.[walletAddress]?.unsubscribe();

          const unsubscribe = api.rx.query.system.account(walletAddress).subscribe(async (result) => {
            const data = (result as any).data;
            const balance = formatBalance(data as AccountData);
            const token = assets[0]?.assetId;
            const price = tokensPrice[token]?.usd ?? 0;
            const usd24HoursChange = tokensPrice[token]?.usd24HoursChange ?? 0;

            const currency: Currency = {
              token,
              mainNetwork: networkName,
              price,
              usd24HoursChange,
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
        console.log(
          `
          Subscribe to ${networkName.toUpperCase()} failed
          ${ex}
          `
        );
      }
    });
  },
};

function getMockCurrencies(networks: Networks): MockCurrencies {
  const currencies: Currency[] = networks.map(({ name, assets }) => {
    return {
      availableInNetworks: [],
      mainNetwork: name,
      price: 0,
      token: assets[0]?.assetId,
      usd24HoursChange: 0,
    };
  });

  return {
    substrate: currencies.filter(({ mainNetwork }) => !ETHEREUM_NETWORKS.includes(mainNetwork)),
    ethereum: currencies.filter(({ mainNetwork }) => ETHEREUM_NETWORKS.includes(mainNetwork)),
  };
}

export default actions;
