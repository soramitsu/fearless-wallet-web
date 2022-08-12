import keyring from '@polkadot/ui-keyring';
import { getMetaTyped } from '@/util/helpers';
import { accountController } from '@/controllers/accountController';
import type { MutationTree } from 'vuex';
import type { SetSelectedWalletProps, SetSelectedFiatProps } from './types';
import type { State } from './state';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SetSelectedWalletProps): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: SetSelectedFiatProps): void;
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

  [MutationTypes.SET_SELECTED_FIAT](state, { fiatName, currencies }) {
    state.selectedFiat = fiatName;

    accountController.setSelectedFiat(fiatName);

    currencies.forEach((currency) => currency.updatePrice(fiatName));
  },
};

export default mutations;
