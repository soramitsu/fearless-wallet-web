import { ActionTree, ActionContext } from 'vuex';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { MutationTypes, Mutations } from './mutations';
import { FullNetwork, Networks } from './types';
import { State } from './state';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { formatBalance } from '@/util/balances';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export enum ActionTypes {
  LOAD_NETWORKS_INFO = 'LOAD_NETWORKS_INFO',
  SUBSCRIBE_TO_BALANCES = 'SUBSCRIBE_TO_BALANCES',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, State>, 'commit'>;

export type Actions = {
  [ActionTypes.LOAD_NETWORKS_INFO](
    store: AugmentedActionContext,
    { url, autoConnectMs }: Record<string, string | number>
  ): Promise<void>;
  [ActionTypes.SUBSCRIBE_TO_BALANCES](
    store: AugmentedActionContext,
    { accounts }: Record<string, SubjectInfo>
  ): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS_INFO]({ commit }, { url, autoConnectMs = 0 }) {
    const response = await fetch(url as string);
    const networks: FullNetwork[] = await response.json();

    const networksInfo: Networks = networks.map(({ nodes, name, assets, addressPrefix }) => {
      let isActive = false;
      const networkName = name.toLocaleLowerCase();
      const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);
      const url = name === 'Astar' ? nodes[1].url : nodes[0].url;

      const provider = new WsProvider(url, autoConnectMs as number);
      const api = new ApiPromise({ provider });

      try {
        api.connect();

        isActive = true;

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
        isActive,
        isEthereumNetwork,
        balances: [],
      };
    });

    commit(MutationTypes.SET_NETWORKS, { networks: networksInfo });
  },
  async [ActionTypes.SUBSCRIBE_TO_BALANCES]({ commit, state }, { accounts }) {
    const { networks } = state;

    for (const { api, isEthereumNetwork, name } of networks) {
      await api.isReady;

      try {
        Object.entries(accounts).forEach(([address, { type }]) => {
          // ethereum accounts only subscribe to the ethereum networks
          if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

          api.rx.query.system.account(address).subscribe(async (result) => {
            const data = (result as any).data;
            const balance = formatBalance(data as AccountData, 12);

            commit(MutationTypes.SET_NETWORK_BALANCES, {
              name,
              balances: [
                {
                  balance,
                  address,
                },
              ],
            });

            console.log(
              `
              Address: ${address},
              Network: ${name},
              `,
              { ...balance }
            );
          });
        });
      } catch (ex) {
        console.log(
          `
          Subscribe to ${name.toUpperCase()} failed
          ${ex}
          `
        );
      }
    }
  },
};

export default actions;
