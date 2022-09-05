import type { GetterTree } from 'vuex';
import type { SelectedWallet, Accounts } from './types';
import type { State } from './state';
import type { FiatJson } from '../networks/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import store from '@/store';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
  getSelectedFiat = 'getSelectedFiat',
  getFiatSymbol = 'getFiatSymbol',
  getAccounts = 'getAccounts',
}

export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getSelectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getAccounts](state: State, getters?: GetterTree<State, State> & Getters): Accounts;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getSelectedWallet]({ selectedWallet }): SelectedWallet {
    return selectedWallet;
  },
  [GettersTypes.getSelectedFiat]({ selectedFiat }): string {
    return selectedFiat;
  },
  [GettersTypes.getFiatSymbol]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.getFiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.symbol ?? '';
  },
  [GettersTypes.getAccounts]({ accounts }): Accounts {
    return accounts;
  },
};

export default getters;
