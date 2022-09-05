import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from './networks/state';
import type { State as AccountState } from './accounts/state';
import type { State as AuthState } from './auth/types';
import type { State as SignState } from './sign/types';
import type { State as MetaState } from './metadata/types';

type ModulesTypes = NetworksState & AccountState & AuthState & SignState & MetaState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
