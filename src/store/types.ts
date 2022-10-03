import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from './networks/state';
import type { State as AccountState } from './accounts/state';
import type { State as AuthState } from './auth/state';
import type { State as SignState } from './sign/state';
import type { State as MetaState } from './metadata/state';

type ModulesTypes = NetworksState & AccountState & AuthState & SignState & MetaState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
