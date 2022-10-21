import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import type { MutationTree } from 'vuex';
import type {
  SetSelectedWalletProps,
  SetSelectedFiatProps,
  SetSelectedNetworkProps,
  setAccountsProps,
  setAddressesProps,
} from './types';
import type { State } from './state';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import BaseApi from '@/util/BaseApi';
import { accountController } from '@/controllers/accountController';
import { getMetaTyped } from '@/helpers/common';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ADDRESSES = 'SET_ADDRESSES',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SetSelectedWalletProps): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: SetSelectedFiatProps): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, props: SetSelectedNetworkProps): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: setAccountsProps): void;
  [MutationTypes.SET_ADDRESSES](state: State, props: setAddressesProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, { selectedWalletAddress }) {
    let meta: KeyringPair$Meta | KeyringJson$Meta;

    if (BaseApi.getAddressType(selectedWalletAddress) === 'account') meta = BaseApi.getPair(selectedWalletAddress).meta;
    else {
      const address = BaseApi.getAddress(selectedWalletAddress);

      if (!address) return;

      meta = address.meta;
    }

    const { name, ethereumAddress } = getMetaTyped(meta);
    accountController.setSelectedWalletAddress(selectedWalletAddress);

    state.selectedWallet = {
      address: selectedWalletAddress,
      ethereumAddress: ethereumAddress ?? '',
      name,
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, { fiatName, currencies }) {
    accountController.setSelectedFiat(fiatName);

    state.selectedFiat = fiatName;

    currencies.forEach((currency) => currency.updatePrice());
  },

  [MutationTypes.SET_SELECTED_NETWORK](state, { network }) {
    const {
      selectedWallet: { address },
      selectedNetworks,
    } = state;

    state.selectedNetworks = { ...selectedNetworks, [address]: network };
  },

  [MutationTypes.SET_ACCOUNTS](state, { accounts }) {
    state.accounts = accounts;
  },

  [MutationTypes.SET_ADDRESSES](state, { addresses }) {
    state.addresses = addresses;
  },
};

export default mutations;
