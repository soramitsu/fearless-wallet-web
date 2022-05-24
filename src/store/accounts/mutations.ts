import { MutationTree } from 'vuex';
import { State } from './state';
import { SetPasswordProps, SetSelectedWalletAddressProps } from './types';
import { getMetaTyped } from '@/util/meta';
import keyring from '@polkadot/ui-keyring';

export enum MutationTypes {
  SET_PASSWORD = 'SET_PASSWORD',
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

export type Mutations = {
  [MutationTypes.SET_PASSWORD](state: State, { password }: SetPasswordProps): void;
  [MutationTypes.SET_SELECTED_WALLET](state: State, { selectedWalletAddress }: SetSelectedWalletAddressProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_PASSWORD](state, { password }) {
    state.password = password;
  },
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWalletAddress }) {
    const { meta, type } = keyring.getPair(selectedWalletAddress);
    const { name, ethereumAddress } = getMetaTyped(meta);

    state.selectedWallet = {
      address: selectedWalletAddress,
      ethereumAddress,
      name,
      type,
    };
  },
};

export default mutations;
