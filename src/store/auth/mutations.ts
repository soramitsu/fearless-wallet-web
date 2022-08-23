import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_AUTH_REQUEST = 'SET_AUTH_REQUEST',
}
type Props = string;
export type Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state: State, props: Props): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_REQUEST]({ requests }, payload) {
    requests.push(payload);
  },
};

export default mutations;
