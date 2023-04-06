import type { GetterTree } from 'vuex';
import type { State } from './state';

export enum GettersTypes {
  authLogin = 'authLogin',
}

export type Getters = {
  [GettersTypes.authLogin](state: State): string;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.authLogin]({ authLogin }): string {
    return authLogin;
  },
};

export default getters;
