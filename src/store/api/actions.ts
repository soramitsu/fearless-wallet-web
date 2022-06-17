import { ActionTree, ActionContext } from 'vuex';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { MutationTypes, Mutations } from './mutations';
import { FullNetwork, Networks } from './types';
import { State } from './state';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';

export enum ActionTypes {
  LOAD_NETWORKS_INFO = 'LOAD_NETWORKS_INFO',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, State>, 'commit'>;

export type Actions = {
  [ActionTypes.LOAD_NETWORKS_INFO](
    { commit }: AugmentedActionContext,
    { url, autoConnectMs }: Record<string, string | number>
  ): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.LOAD_NETWORKS_INFO]({ commit }, { url, autoConnectMs = 0 }) {
    const response = await fetch(url as string);
    const networks: FullNetwork[] = await response.json();

    const networksInfo: Networks = networks.reduce((accumulator, { nodes, name, assets, addressPrefix }) => {
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
        ...accumulator,
        [networkName]: {
          provider,
          api,
          nodes,
          assets,
          addressPrefix,
          isActive,
          isEthereumNetwork,
        },
      };
    }, {});

    commit(MutationTypes.SET_NETWORKS, { networks: networksInfo });
  },
};

export default actions;
