import { GetterTree } from 'vuex';
import { State } from './state';

export enum GettersTypes {
  getPassword = 'getPassword',
}

export type Getters = {
  [GettersTypes.getPassword](state: State, getters?: GetterTree<State, State> & Getters): string;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
};

export default getters;
