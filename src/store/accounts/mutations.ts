import keyring from '@polkadot/ui-keyring';
import { getMetaTyped } from '@/util/helpers';
import type { MutationTree } from 'vuex';
import type { SetSelectedWalletProps } from './types';
import type { State } from './state';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SetSelectedWalletProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWalletAddress }) {
    const { meta } = keyring.getPair(selectedWalletAddress);
    const { name, ethereumAddress } = getMetaTyped(meta);

    state.selectedWallet = {
      address: selectedWalletAddress,
      ethereumAddress,
      name,
    };
  },
};

export default mutations;
