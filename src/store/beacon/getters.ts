import { State } from './state';
import type { GetterTree } from 'vuex';

export enum GettersTypes {
  GET_QR = 'getQR',
}

export type Getters = {
  [GettersTypes.GET_QR](state: State, getters?: GetterTree<State, State> & Getters): Nullable<string>;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.GET_QR]({ qr }): Nullable<string> {
    return qr;
  },
};

export default getters;
