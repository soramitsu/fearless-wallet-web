import { MutationTree } from 'vuex';
import { State } from './state';
import keyring from '@polkadot/ui-keyring';

export enum MutationTypes {
  SET_PASSWORD = 'SET_PASSWORD',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

export type Mutations = {
  [MutationTypes.SET_PASSWORD](state: State, { password }: Record<string, string>): void;
  [MutationTypes.SET_SELECTED_WALLET](state: State, { selectedWallet }: Record<string, string>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_PASSWORD](state, { password }) {
    state.password = password;
  },
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWalletAddress }) {
    const {
      meta: { name },
      type,
    } = keyring.getPair(selectedWalletAddress);

    state.selectedWallet = {
      address: selectedWalletAddress,
      name: name as string,
      type,
    };
  },
};

export default mutations;
