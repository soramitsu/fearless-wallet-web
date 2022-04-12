import { GetterTree } from 'vuex';
import { State } from './state';

export enum GettersTypes {
  getPassword = 'getPassword',
}

export type Getters = {
  [GettersTypes.getPassword](state: State, getters?: any): string;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
};

export default getters;
