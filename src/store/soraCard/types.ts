import type { Mutations } from '@/store/soraCard/mutations';
import type { ActionContext } from 'vuex';
import type { State } from '@/store/soraCard/state';

type AugmentedSoraCardContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export { AugmentedSoraCardContext };
