import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import type { GetterTree } from 'vuex';
import type { SelectedWallet } from './types';
import type { State } from './state';
import type { FiatJson } from '../networks/types';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
  getSelectedFiat = 'getSelectedFiat',
  getFiatSymbol = 'getFiatSymbol',
}

export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getSelectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
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
};

export default getters;
